import { TFile } from 'obsidian';
import type { App, TAbstractFile } from 'obsidian';
import type { VectorStore } from './VectorStore';
import type { EmbeddingService } from './EmbeddingService';
import type { PerformanceMonitor } from './PerformanceMonitor';
import type StanleyPlugin from '../main';
import type { StanleySettings } from '../settings';

const BATCH_SIZE = 10;

export class IndexManager {
  constructor(
    private app: App,
    private store: VectorStore,
    private embeddingService: EmbeddingService,
    private monitor: PerformanceMonitor,
    private plugin: StanleyPlugin
  ) {}

  async initialize(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    const isFirstRun = Object.keys(this.plugin.settings.fileModTimes).length === 0;

    const toIndex: TFile[] = [];
    let skipped = 0;

    for (const file of files) {
      const storedMtime = this.plugin.settings.fileModTimes[file.path];
      if (!isFirstRun && storedMtime === file.stat.mtime) {
        skipped++;
      } else {
        toIndex.push(file);
      }
    }

    const startMs = Date.now();
    await this.indexFiles(toIndex);
    const durationMs = Date.now() - startMs;

    const cacheHitRate = files.length > 0 ? skipped / files.length : 0;
    const totalChunks = this.store.size;
    this.monitor.recordIndex(totalChunks, durationMs, cacheHitRate);

    this.registerEventListeners();
  }

  async reindexAll(): Promise<void> {
    this.store.clear();
    this.plugin.settings.fileModTimes = {};
    await this.plugin.saveSettings();
    await this.initialize();
  }

  private async indexFiles(files: TFile[]): Promise<void> {
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((file) => this.indexFile(file)));
    }
    if (files.length > 0) {
      await this.plugin.saveSettings();
    }
  }

  private async indexFile(file: TFile): Promise<void> {
    this.store.removeByFile(file.path);
    const content = await this.app.vault.read(file);
    const chunks = this.embeddingService.chunkNote(file, content, this.plugin.settings);
    if (chunks.length === 0) return;
    const embedded = await this.embeddingService.embedChunks(chunks);
    this.store.insert(embedded);
    this.plugin.settings.fileModTimes[file.path] = file.stat.mtime;
  }

  private registerEventListeners(): void {
    this.plugin.registerEvent(
      this.app.vault.on('modify', (abstract: TAbstractFile) => {
        if (abstract instanceof TFile) void this.indexFile(abstract);
      })
    );
    this.plugin.registerEvent(
      this.app.workspace.on('file-open', (file: TFile | null) => {
        if (file) void this.indexFile(file);
      })
    );
    this.plugin.registerEvent(
      this.app.vault.on('delete', (abstract: TAbstractFile) => {
        if (abstract instanceof TFile) {
          this.store.removeByFile(abstract.path);
          delete this.plugin.settings.fileModTimes[abstract.path];
        }
      })
    );
  }
}
