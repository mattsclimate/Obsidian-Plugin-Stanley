import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexManager } from '../src/services/IndexManager';
import { TFile, App } from 'obsidian';
import type { VectorStore } from '../src/services/VectorStore';
import type { EmbeddingService } from '../src/services/EmbeddingService';
import type { PerformanceMonitor } from '../src/services/PerformanceMonitor';
import type StanleyPlugin from '../src/main';

function makePlugin(fileModTimes: Record<string, number> = {}): StanleyPlugin {
  return {
    settings: {
      ollamaBaseUrl: 'http://localhost:11434',
      embeddingModel: 'nomic-embed-text',
      chatModel: 'llama3',
      chunkSize: 500,
      chunkOverlap: 50,
      topK: 5,
      maxContextTokens: 4096,
      autoTuneEnabled: true,
      fileModTimes,
    },
    saveSettings: vi.fn().mockResolvedValue(undefined),
    registerEvent: vi.fn(),
  } as unknown as StanleyPlugin;
}

function makeFile(path: string, mtime: number): TFile {
  return new TFile(path, mtime);
}

describe('IndexManager', () => {
  let mockStore: VectorStore;
  let mockEmbeddingService: EmbeddingService;
  let mockMonitor: PerformanceMonitor;
  let mockApp: App;

  beforeEach(() => {
    mockStore = {
      insert: vi.fn(),
      removeByFile: vi.fn(),
      clear: vi.fn(),
      search: vi.fn(),
      size: 0,
    } as unknown as VectorStore;

    mockEmbeddingService = {
      chunkNote: vi.fn().mockReturnValue([{ filePath: 'a.md', content: 'chunk', charOffset: 0 }]),
      embedChunks: vi.fn().mockResolvedValue([
        { filePath: 'a.md', content: 'chunk', charOffset: 0, embedding: [0.1] },
      ]),
    } as unknown as EmbeddingService;

    mockMonitor = {
      recordIndex: vi.fn(),
    } as unknown as PerformanceMonitor;

    mockApp = new App();
    vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([]);
    vi.spyOn(mockApp.vault, 'read').mockResolvedValue('note content');
    vi.spyOn(mockApp.vault, 'on').mockReturnValue({} as any);
    vi.spyOn(mockApp.workspace, 'on').mockReturnValue({} as any);
  });

  describe('initialize - first run', () => {
    it('indexes all markdown files when fileModTimes is empty', async () => {
      const file1 = makeFile('a.md', 1000);
      const file2 = makeFile('b.md', 2000);
      vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([file1, file2]);

      const plugin = makePlugin({});
      const manager = new IndexManager(mockApp, mockStore, mockEmbeddingService, mockMonitor, plugin);
      await manager.initialize();

      expect(mockEmbeddingService.embedChunks).toHaveBeenCalledTimes(2);
      expect(mockStore.insert).toHaveBeenCalledTimes(2);
      expect(plugin.settings.fileModTimes['a.md']).toBe(1000);
      expect(plugin.settings.fileModTimes['b.md']).toBe(2000);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('initialize - incremental', () => {
    it('skips unchanged files', async () => {
      const file1 = makeFile('a.md', 1000);
      const file2 = makeFile('b.md', 2000);
      vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([file1, file2]);

      // Both files already indexed at current mtime
      const plugin = makePlugin({ 'a.md': 1000, 'b.md': 2000 });
      const manager = new IndexManager(mockApp, mockStore, mockEmbeddingService, mockMonitor, plugin);
      await manager.initialize();

      expect(mockEmbeddingService.embedChunks).not.toHaveBeenCalled();
    });

    it('re-indexes only modified files', async () => {
      const file1 = makeFile('a.md', 1000);
      const file2 = makeFile('b.md', 3000); // mtime changed from 2000 to 3000
      vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([file1, file2]);

      const plugin = makePlugin({ 'a.md': 1000, 'b.md': 2000 });
      const manager = new IndexManager(mockApp, mockStore, mockEmbeddingService, mockMonitor, plugin);
      await manager.initialize();

      expect(mockEmbeddingService.embedChunks).toHaveBeenCalledTimes(1);
      expect(mockStore.removeByFile).toHaveBeenCalledWith('b.md');
      expect(plugin.settings.fileModTimes['b.md']).toBe(3000);
    });

    it('records cache hit rate with monitor', async () => {
      const file1 = makeFile('a.md', 1000);
      const file2 = makeFile('b.md', 2000);
      vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([file1, file2]);

      // Only b.md is new
      const plugin = makePlugin({ 'a.md': 1000 });
      const manager = new IndexManager(mockApp, mockStore, mockEmbeddingService, mockMonitor, plugin);
      await manager.initialize();

      expect(mockMonitor.recordIndex).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        0.5 // 1 skipped out of 2 total
      );
    });
  });
});
