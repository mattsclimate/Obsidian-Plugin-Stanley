import { App, TFile } from 'obsidian';
import type { AIProviderManager } from './AIProviderManager';
import type { VectorStore } from './VectorStore';
import type { PerformanceMonitor } from './PerformanceMonitor';
import type { StanleySettings } from '../settings';
import type { ChatMessage } from '../types';

export class RAGEngine {
  constructor(
    private client: AIProviderManager,
    private store: VectorStore,
    private monitor: PerformanceMonitor,
    private app: App
  ) {}

  async query(
    userQuery: string,
    settings: StanleySettings,
    onToken: (token: string) => void,
    explicitContext?: { path: string, content: string }[]
  ): Promise<{ response: string; settings: StanleySettings }> {
    const t0 = Date.now();

    let claudeInstructions = '';
    try {
      const claudeFile = this.app.vault.getAbstractFileByPath('CLAUDE.md');
      if (claudeFile instanceof TFile) {
        const content = await this.app.vault.read(claudeFile);
        claudeInstructions = `\n--- CLAUDE.md SCHEMA & RULES (FOLLOW SCRUPULOUSLY) ---\n${content}\n`;
      }
    } catch (e) {
      console.warn('Stanley: Failed to read CLAUDE.md', e);
    }

    const queryEmbedding = await this.client.embed(userQuery);
    const t1 = Date.now();

    const topK = settings.extendedThinking ? settings.topK * 2 : settings.topK;
    const chunks = await this.store.search(queryEmbedding, topK);
    const t2 = Date.now();

    // Aggressive token/character budget limit
    // Heuristic: 1 token ≈ 4 characters
    const maxTokens = settings.ecoMode ? Math.min(settings.maxContextTokens, 2048) : settings.maxContextTokens;
    const totalCharBudget = maxTokens * 4;

    const explicitContextStr = explicitContext && explicitContext.length > 0
      ? `--- EXPLICITLY MENTIONED ITEMS ---\n${explicitContext.map(ec => `ATTACHMENT: [[${ec.path}]]\n${ec.content}`).join('\n\n')}\n\n`
      : '';

    const systemPromptBase = [
      'You are Stanley, a highly capable knowledge assistant for a personal Obsidian vault.',
      'Format your response using Markdown.',
      claudeInstructions,
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
      '- obsidian append_link file="Name" target="Target" — appends a [[Target]] link to the bottom of the file',
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
      'KARPATHY LLM WIKI INGESTION WIZARD:',
      'When the user requests to ingest or process a new source (e.g. in the raw/ folder):',
      '1. Analyze the source and summarize the key takeaways in your text response.',
      '2. Generate a staged sequence of commands for the user to execute one-by-one to update the wiki. Do NOT write them automatically.',
      '3. For example, stage a create command for the wiki page, then an append_link command to link it in the wiki index, then a property:set command to update status/metadata.',
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
      'User: "Link wiki/index.md to wiki/topic.md"',
      '[ACTION: Link wiki/index.md to wiki/topic.md]',
      'obsidian append_link file="wiki/index.md" target="wiki/topic.md"',
      '',
      '--- KNOWLEDGE CONTEXT ---',
      'Answer the question using the context provided below. If the answer is not in the context, say "I couldn\'t find that in your vault."',
      'Cite sources using [[wikilink]] format.',
      '',
      explicitContextStr,
      'Retrieved Context:',
    ].join('\n');

    const endPromptStr = `\n\nQuestion: ${userQuery}`;

    // Calculate how much budget remains for the retrieved RAG chunks
    const fixedPromptLength = systemPromptBase.length + endPromptStr.length;
    let remainingBudget = totalCharBudget - fixedPromptLength;

    const allowedChunks: string[] = [];
    for (const c of chunks) {
      const noteName = c.filePath.replace(/\.md$/, '').split('/').pop() ?? c.filePath;
      const chunkStr = `[[${noteName}]]\n${c.content}`;
      
      // If adding this chunk exceeds our character budget, stop adding
      if (chunkStr.length + 10 > remainingBudget) {
        break;
      }
      
      allowedChunks.push(chunkStr);
      remainingBudget -= (chunkStr.length + 10);
    }

    const context = allowedChunks.join('\n\n---\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: systemPromptBase + '\n' + context + endPromptStr,
        timestamp: Date.now(),
      },
    ];

    const { response, tokenCount } = await this.client.chat(messages, onToken);
    const t3 = Date.now();

    this.monitor.recordQuery(t1 - t0, t2 - t1, t3 - t2, tokenCount, maxTokens);
    const updatedSettings = this.monitor.maybeAutoTune(settings);

    return { response, settings: updatedSettings };
  }
}
