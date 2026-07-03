import type { OllamaClient } from './OllamaClient';
import type { VectorStore } from './VectorStore';
import type { PerformanceMonitor } from './PerformanceMonitor';
import { ModelRouter, type ModelTask } from './ModelRouter';
import { MemPalaceService } from './MemPalaceService';
import type { CloudModelClient } from './CloudModelClient';
import type { StanleySettings } from '../settings';
import type { ChatMessage } from '../types';

export interface RAGQueryOptions {
  cloudApprovedForRequest?: boolean;
  wifiConnected?: boolean;
  mempalaceContent?: string;
}

export class RAGEngine {
  constructor(
    private client: OllamaClient,
    private store: VectorStore,
    private monitor: PerformanceMonitor,
    private router = new ModelRouter(),
    private cloudClient?: CloudModelClient,
    private mempalaceService = new MemPalaceService()
  ) {}

  async query(
    userQuery: string,
    settings: StanleySettings,
    onToken: (token: string) => void,
    explicitContext?: { path: string, content: string }[],
    options: RAGQueryOptions = {}
  ): Promise<{ response: string; settings: StanleySettings; requiresCloudApproval?: boolean }> {
    const t0 = Date.now();
    const selectedProvider = settings.selectedChatModel?.provider ?? 'local';
    const task = this.classifyTask(userQuery);

    const queryEmbedding = await this.client.embed(userQuery);
    const t1 = Date.now();

    const topK = settings.extendedThinking ? settings.topK * 2 : settings.topK;
    const chunks = this.store.search(queryEmbedding, topK);
    const t2 = Date.now();

    const retrievedContext = chunks
      .map((c) => {
        const noteName = c.filePath.replace(/\.md$/, '').split('/').pop() ?? c.filePath;
        return `[[${noteName}]]\n${c.content}`;
      })
      .join('\n\n---\n\n');

    const mempalaceContext = settings.mempalaceEnabled
      ? this.mempalaceService.formatContext(
        this.mempalaceService.findRelevantEpisodes(userQuery, options.mempalaceContent ?? '', 3)
      )
      : '';
    const context = `${mempalaceContext}${retrievedContext}`;

    const explicitContextStr = explicitContext && explicitContext.length > 0
      ? `--- EXPLICITLY MENTIONED ITEMS ---\n${explicitContext.map(ec => `ATTACHMENT: [[${ec.path}]]\n${ec.content}`).join('\n\n')}\n\n`
      : '';

    const prompt = [
      'You are Stanley, a highly capable knowledge assistant for a personal Obsidian vault.',
      'Format your response using Markdown.',
      settings.extendedThinking ? '\n--- EXTENDED THINKING ENABLED ---\nProvide a comprehensive, exhaustive, and multi-faceted analysis. Think through the problem step-by-step and verify your insights against the provided context before answering.\n' : '',
      '',
      '--- ACTION CAPABILITIES (obsidian-cli) ---',
      'Use the `obsidian` CLI to interact with the vault. Place each command on a new line.',
      '',
      'Syntax:',
      '- Param: key=value or key="value with spaces"',
      '- Flag: key (e.g. silent, overwrite)',
      '- Use \\n for newlines and \\t for tabs in content strings.',
      '',
      'Available Commands:',
      '- obsidian read file="Name" (or path="Folder/File.md") — returns file content',
      '- obsidian create name="Name" content="Text" [silent] [overwrite] — creates a new note',
      '- obsidian append file="Name" content="Text" — appends to a note',
      '- obsidian search query="term" [limit=N] — searches file names',
      '- obsidian property:set name="key" value="val" file="Name" — updates frontmatter',
      '- obsidian eval code="JS_CODE" — run JavaScript in the app context (use "return ...")',
      '',
      'WHEN TO USE COMMANDS:',
      'If the user\'s request implies creating, saving, writing, editing, appending, or updating a note — emit the appropriate command.',
      'Do NOT ask for permission in your text response. Emit the command and the UI will present it to the user for approval.',
      '',
      'Always emit an [ACTION: ...] label line immediately before each command so the UI can display a human-readable description.',
      'Format: [ACTION: <short description>]',
      '',
      'Examples of intent → command:',
      '',
      'User: "Save this as a note called Project Ideas"',
      '[ACTION: Create note "Project Ideas"]',
      'obsidian create name="Project Ideas" content="<your response content>"',
      '',
      'User: "Add that to my daily log"',
      '[ACTION: Append to "Daily Log"]',
      'obsidian append file="Daily Log" content="<your response content>"',
      '',
      'User: "Create a note about the meeting"',
      '[ACTION: Create note "Meeting Notes"]',
      'obsidian create name="Meeting Notes" content="<summary>"',
      '',
      'User: "Update my reading list with this book"',
      '[ACTION: Append to "Reading List"]',
      'obsidian append file="Reading List" content="- <book title>"',
      '',
      '--- KNOWLEDGE CONTEXT ---',
      'Answer the question using the context provided below. If the answer is not in the context, say "I couldn\'t find that in your vault."',
      'Cite sources using [[wikilink]] format.',
      '',
      explicitContextStr,
      'Retrieved Context:',
      context,
      '',
      `Question: ${userQuery}`,
    ].join('\n');

    const route = this.router.resolve({
      cloudEnabled: settings.cloudEnabled,
      selectedProvider,
      cloudApprovedForRequest: options.cloudApprovedForRequest,
      batterySaverMode: settings.batterySaverMode,
      cloudOnlyOnWifi: settings.cloudOnlyOnWifi,
      wifiConnected: options.wifiConnected,
    }, task);

    if (route.route === 'cloud-preview') {
      return {
        response: this.cloudPreview(settings.selectedChatModel.label, prompt),
        settings,
        requiresCloudApproval: true,
      };
    }

    if (route.route === 'cloud') {
      if (!this.cloudClient || selectedProvider === 'local') {
        throw new Error('Cloud model client is not configured');
      }
      const response = await this.cloudClient.complete({
        provider: selectedProvider,
        model: settings.selectedChatModel.model,
        apiKey: settings.cloudApiKeys[selectedProvider],
        prompt,
        maxTokens: settings.maxContextTokens,
      });
      const t3 = Date.now();
      this.monitor.recordQuery(t1 - t0, t2 - t1, t3 - t2, 0, settings.maxContextTokens);
      return { response, settings: this.monitor.maybeAutoTune(settings) };
    }

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      },
    ];

    const { response, tokenCount } = await this.client.chat(messages, onToken);
    const t3 = Date.now();

    this.monitor.recordQuery(t1 - t0, t2 - t1, t3 - t2, tokenCount, settings.maxContextTokens);
    const updatedSettings = this.monitor.maybeAutoTune(settings);

    return { response, settings: updatedSettings };
  }

  private classifyTask(query: string): ModelTask {
    const lower = query.toLowerCase();
    if (lower.includes('reorganize') || lower.includes('reorg')) return 'reorg-plan';
    if (lower.includes('extract') || lower.includes('ocr')) return 'large-extraction';
    if (lower.includes('draft') || lower.includes('write') || lower.includes('compose')) return 'draft';
    if (lower.includes('synthesize') || lower.includes('compare') || lower.includes('analyze across')) return 'deep-synthesis';
    return 'summarize';
  }

  private cloudPreview(modelLabel: string, prompt: string): string {
    return [
      '## Cloud context preview',
      '',
      `Model: ${modelLabel}`,
      '',
      'Stanley has prepared the context below. Approve this request before anything is sent to a cloud model.',
      '',
      '```text',
      prompt.slice(0, 4000),
      '```',
    ].join('\n');
  }
}
