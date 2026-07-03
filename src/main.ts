import { Notice, Plugin, TFile, TFolder } from 'obsidian';
import { DEFAULT_STANLEY_SETTINGS, StanleySettingTab } from './settings';
import type { StanleySettings } from './settings';
import { OllamaClient } from './services/OllamaClient';
import { VectorStore } from './services/VectorStore';
import { EmbeddingService } from './services/EmbeddingService';
import { PerformanceMonitor } from './services/PerformanceMonitor';
import { IndexManager } from './services/IndexManager';
import { RAGEngine } from './services/RAGEngine';
import { CloudModelClient } from './services/CloudModelClient';
import { CLIService } from './services/CLIService';
import { SkillService } from './services/SkillService';
import { VaultService } from './services/VaultService';
import { ChangeLogService } from './services/ChangeLogService';
import { LibrarianService } from './services/LibrarianService';
import { StanleyTemplateService } from './services/StanleyTemplateService';
import { WorkspaceService } from './services/WorkspaceService';
import { MemPalaceService } from './services/MemPalaceService';
import { ChatView, VIEW_TYPE_CHAT } from './views/ChatView';

export default class StanleyPlugin extends Plugin {
  settings!: StanleySettings;
  ollamaClient!: OllamaClient;

  private store!: VectorStore;
  private embeddingService!: EmbeddingService;
  private monitor!: PerformanceMonitor;
  private indexManager!: IndexManager;
  private ragEngine!: RAGEngine;
  private cliService!: CLIService;
  private skillService!: SkillService;
  private vaultService!: VaultService;
  private changeLogService!: ChangeLogService;
  private librarianService!: LibrarianService;
  private templateService!: StanleyTemplateService;
  private workspaceService!: WorkspaceService;
  private mempalaceService!: MemPalaceService;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.ollamaClient = new OllamaClient(
      this.settings.ollamaBaseUrl,
      this.settings.embeddingModel,
      this.settings.chatModel
    );
    this.store = new VectorStore();
    this.embeddingService = new EmbeddingService(this.ollamaClient);
    this.monitor = new PerformanceMonitor();
    this.indexManager = new IndexManager(
      this.app,
      this.store,
      this.embeddingService,
      this.monitor,
      this
    );
    this.mempalaceService = new MemPalaceService();
    this.ragEngine = new RAGEngine(
      this.ollamaClient,
      this.store,
      this.monitor,
      undefined,
      new CloudModelClient(),
      this.mempalaceService
    );
    this.cliService = new CLIService(this.app);
    this.skillService = new SkillService(this.app);
    this.vaultService = new VaultService(this.app);
    this.changeLogService = new ChangeLogService();
    this.librarianService = new LibrarianService();
    this.templateService = new StanleyTemplateService();
    this.workspaceService = new WorkspaceService();

    this.registerView(VIEW_TYPE_CHAT, (leaf) =>
      new ChatView(leaf, this, this.ragEngine, this.indexManager, this.monitor, this.cliService, this.skillService, this.vaultService)
    );

    this.addRibbonIcon('message-circle', 'Open Stanley Chat', () => {
      void this.activateChatView();
    });

    this.addCommand({
      id: 'open-chat',
      name: 'Open chat panel',
      callback: () => void this.activateChatView(),
    });

    this.addCommand({
      id: 'reindex-vault',
      name: 'Re-index entire vault',
      callback: () => {
        new Notice('Stanley: Re-indexing vault...');
        void this.indexManager.reindexAll().then(() =>
          new Notice('Stanley: Re-index complete.')
        );
      },
    });

    this.addCommand({
      id: 'open-daily-command-center',
      name: 'Open Daily Command Center',
      callback: () => void this.openDailyCommandCenter(),
    });

    this.addCommand({
      id: 'librarian-autofix-active-note',
      name: 'Run deterministic librarian autofix on active note',
      callback: () => void this.librarianAutofixActiveNote(),
    });

    this.addCommand({
      id: 'suggest-workspace-mode',
      name: 'Suggest Stanley workspace mode for active note',
      callback: () => this.suggestWorkspaceMode(),
    });

    this.addSettingTab(new StanleySettingTab(this.app, this));

    const healthy = await this.ollamaClient.checkHealth();
    if (!healthy) {
      new Notice(`Stanley: Ollama not reachable at ${this.settings.ollamaBaseUrl}. Indexing skipped.`);
      return;
    }

    void this.indexManager.initialize().then(() => {
      new Notice('Stanley: Vault indexed and ready.');
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<StanleySettings> | null;
    this.settings = {
      ...DEFAULT_STANLEY_SETTINGS,
      ...saved,
      cloudApiKeys: {
        ...DEFAULT_STANLEY_SETTINGS.cloudApiKeys,
        ...(saved?.cloudApiKeys ?? {}),
      },
      cloudModelPresets: {
        ...DEFAULT_STANLEY_SETTINGS.cloudModelPresets,
        ...(saved?.cloudModelPresets ?? {}),
      },
      selectedChatModel: saved?.selectedChatModel ?? {
        provider: 'local',
        model: saved?.chatModel ?? DEFAULT_STANLEY_SETTINGS.chatModel,
        label: saved?.chatModel ?? DEFAULT_STANLEY_SETTINGS.chatModel,
      },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async activateChatView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]!);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private async openDailyCommandCenter(): Promise<void> {
    await this.ensureFolder('Calendar');
    const date = new Date().toISOString().slice(0, 10);
    const path = `Calendar/${date}.md`;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      file = await this.app.vault.create(path, this.templateService.dailyNote(date));
      await this.appendChangeLog('user', 'daily-command-center', [path], 'Created daily command center note');
      await this.appendMemPalace('daily-created', 'Created daily command center note', ['daily', 'calendar'], [path]);
    }
    await this.app.workspace.getLeaf().setViewState({ type: 'markdown', state: { file: path } });
  }

  private async librarianAutofixActiveNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile)) {
      new Notice('Stanley: No active note to fix.');
      return;
    }

    const content = await this.app.vault.read(file);
    const knownPaths = this.app.vault.getMarkdownFiles().map((knownFile) => knownFile.path);
    const result = this.librarianService.prepareAutofix(content, file.path, knownPaths);
    if (result.changes.length === 0) {
      new Notice('Stanley: No deterministic fixes found.');
      return;
    }
    if (!result.canAutofix) {
      new Notice('Stanley: Fix requires review.');
      return;
    }

    await this.app.vault.modify(file, result.content);
    await this.appendChangeLog(
      'stanley',
      'librarian-autofix',
      [file.path],
      `Applied deterministic fixes: ${result.changes.join(', ')}`
    );
    await this.appendMemPalace('librarian-autofix', `Applied deterministic fixes: ${result.changes.join(', ')}`, ['librarian', 'autofix'], [file.path]);
    new Notice('Stanley: Deterministic librarian fixes applied.');
  }

  private suggestWorkspaceMode(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Stanley: Open a note first.');
      return;
    }

    const suggestion = this.workspaceService.suggestMode(file.path, this.settings.workspaceMode);
    if (suggestion.shouldSuggest) {
      new Notice(`Stanley: ${suggestion.message}`);
    } else {
      new Notice('Stanley: Current workspace mode already fits this note.');
    }
  }

  private async appendChangeLog(
    actor: 'stanley' | 'user',
    action: string,
    paths: string[],
    summary: string
  ): Promise<void> {
    const entry = this.changeLogService.formatEntry({
      timestamp: new Date().toISOString(),
      actor,
      action,
      paths,
      summary,
    });
    const logPath = 'log.md';
    const existing = this.app.vault.getAbstractFileByPath(logPath);
    if (existing instanceof TFile) {
      const current = await this.app.vault.read(existing);
      await this.app.vault.modify(existing, `${current.trim()}\n\n${entry}`);
    } else {
      await this.app.vault.create(logPath, `# Stanley Change Log\n\n${entry}`);
    }
  }

  async readMemPalace(): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath('Memory/MemPalace.md');
    if (!(file instanceof TFile)) return '';
    return await this.app.vault.read(file);
  }

  async appendMemPalace(action: string, summary: string, tags: string[], paths: string[] = []): Promise<void> {
    if (!this.settings.mempalaceEnabled) return;
    await this.ensureFolder('Memory');
    const episode = this.mempalaceService.formatEpisode({
      timestamp: new Date().toISOString(),
      action,
      summary,
      tags,
      paths,
    });
    const file = this.app.vault.getAbstractFileByPath('Memory/MemPalace.md');
    if (file instanceof TFile) {
      const current = await this.app.vault.read(file);
      await this.app.vault.modify(file, `${current.trim()}\n${episode}\n`);
    } else {
      await this.app.vault.create('Memory/MemPalace.md', `# MemPalace\n\n${episode}\n`);
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return;
    await this.app.vault.createFolder(path);
  }
}
