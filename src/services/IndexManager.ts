import { TFile } from 'obsidian';
import type { App, TAbstractFile } from 'obsidian';
import type { VectorStore } from './VectorStore';
import type { EmbeddingService } from './EmbeddingService';
import type { PerformanceMonitor } from './PerformanceMonitor';
import type StanleyPlugin from '../main';
import type { StanleySettings } from '../settings';

export class IndexManager {
  private queue: TFile[] = [];
  private isRunning = false;
  private isPaused = false;
  private resolveInitialIndex?: () => void;
  private activeTimeout: any = null;

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
    
    this.registerEventListeners();

    if (toIndex.length > 0) {
      // Add all files to queue
      this.queue = toIndex;
      
      const initialIndexPromise = new Promise<void>((resolve) => {
        this.resolveInitialIndex = resolve;
      });

      this.startQueueRunner();

      await initialIndexPromise;
    }

    const durationMs = Date.now() - startMs;
    const cacheHitRate = files.length > 0 ? skipped / files.length : 0;
    const totalChunks = this.store.size;
    this.monitor.recordIndex(totalChunks, durationMs, cacheHitRate);
  }

  async reindexAll(): Promise<void> {
    this.pause();
    this.queue = [];
    this.store.clear();
    this.plugin.settings.fileModTimes = {};
    await this.plugin.saveSettings();
    this.resume();
    await this.initialize();
  }

  pause(): void {
    this.isPaused = true;
    if (this.activeTimeout) {
      clearTimeout(this.activeTimeout);
      this.activeTimeout = null;
    }
  }

  resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.startQueueRunner();
    }
  }

  queueFile(file: TFile): void {
    // Prevent duplicates in queue
    if (!this.queue.some((f) => f.path === file.path)) {
      this.queue.push(file);
    }
    this.startQueueRunner();
  }

  private startQueueRunner(): void {
    if (this.isRunning || this.isPaused || this.queue.length === 0) return;
    this.isRunning = true;
    void this.processNextBatch();
  }

  private async processNextBatch(): Promise<void> {
    if (this.isPaused || this.queue.length === 0) {
      this.isRunning = false;
      if (this.queue.length === 0 && this.resolveInitialIndex) {
        this.resolveInitialIndex();
        this.resolveInitialIndex = undefined;
      }
      return;
    }

    // Determine batch size and throttle delay based on settings
    const ecoMode = this.plugin.settings.ecoMode;
    const batchSize = ecoMode ? 2 : 10;
    const throttleMs = ecoMode ? 5000 : 1000;

    const batch = this.queue.slice(0, batchSize);
    this.queue = this.queue.slice(batchSize);

    try {
      await Promise.all(batch.map((file) => this.indexFile(file)));
      if (batch.length > 0) {
        await this.plugin.saveSettings();
      }
    } catch (err) {
      console.error('Stanley: Error indexing batch', err);
    }

    // Schedule next batch
    this.activeTimeout = setTimeout(() => {
      this.activeTimeout = null;
      void this.processNextBatch();
    }, throttleMs);
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
        if (abstract instanceof TFile) this.queueFile(abstract);
      })
    );
    this.plugin.registerEvent(
      this.app.workspace.on('file-open', (file: TFile | null) => {
        if (file) this.queueFile(file);
      })
    );
    this.plugin.registerEvent(
      this.app.vault.on('delete', (abstract: TAbstractFile) => {
        if (abstract instanceof TFile) {
          this.store.removeByFile(abstract.path);
          delete this.plugin.settings.fileModTimes[abstract.path];
          // Remove from queue if it was pending
          this.queue = this.queue.filter((f) => f.path !== abstract.path);
        }
      })
    );
  }
}
