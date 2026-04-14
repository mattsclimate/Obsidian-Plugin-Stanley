import { Notice, Plugin } from 'obsidian';
import { DEFAULT_STANLEY_SETTINGS, StanleySettingTab } from './settings';
import type { StanleySettings } from './settings';
import { OllamaClient } from './services/OllamaClient';
import { VectorStore } from './services/VectorStore';
import { EmbeddingService } from './services/EmbeddingService';
import { PerformanceMonitor } from './services/PerformanceMonitor';
import { IndexManager } from './services/IndexManager';
import { RAGEngine } from './services/RAGEngine';
import { CLIService } from './services/CLIService';
import { SkillService } from './services/SkillService';
import { VaultService } from './services/VaultService';
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
    this.ragEngine = new RAGEngine(this.ollamaClient, this.store, this.monitor);
    this.cliService = new CLIService(this.app);
    this.skillService = new SkillService(this.app);
    this.vaultService = new VaultService(this.app);

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
    this.settings = Object.assign(
      {},
      DEFAULT_STANLEY_SETTINGS,
      (await this.loadData()) as Partial<StanleySettings>
    );
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
}
