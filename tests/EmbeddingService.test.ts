import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from '../src/services/EmbeddingService';
import { TFile } from 'obsidian';
import type { StanleySettings } from '../src/settings';
import type { OllamaClient } from '../src/services/OllamaClient';

const defaultSettings: StanleySettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text',
  chatModel: 'llama3',
  chunkSize: 100,
  chunkOverlap: 20,
  topK: 5,
  maxContextTokens: 4096,
  autoTuneEnabled: true,
  fileModTimes: {},
};

function makeMockClient(): OllamaClient {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    chat: vi.fn(),
    checkHealth: vi.fn(),
  } as unknown as OllamaClient;
}

describe('EmbeddingService', () => {
  let mockClient: OllamaClient;
  let service: EmbeddingService;

  beforeEach(() => {
    mockClient = makeMockClient();
    service = new EmbeddingService(mockClient);
  });

  describe('chunkNote', () => {
    it('prepends note title to each chunk', () => {
      const file = new TFile('folder/My Note.md');
      const content = 'First paragraph.\n\nSecond paragraph.';
      const chunks = service.chunkNote(file, content, defaultSettings);
      expect(chunks.every((c) => c.content.startsWith('My Note\n'))).toBe(true);
    });

    it('returns empty array for empty content', () => {
      const file = new TFile('a.md');
      const chunks = service.chunkNote(file, '', defaultSettings);
      expect(chunks).toHaveLength(0);
    });

    it('returns empty array for whitespace-only content', () => {
      const file = new TFile('a.md');
      const chunks = service.chunkNote(file, '   \n\n  ', defaultSettings);
      expect(chunks).toHaveLength(0);
    });

    it('splits content into multiple chunks when content exceeds chunkSize', () => {
      const file = new TFile('a.md');
      // 5 paragraphs of 30 chars each, chunkSize=100 so ~3 paragraphs fit per chunk
      const content = Array(5).fill('A'.repeat(28)).join('\n\n');
      const chunks = service.chunkNote(file, content, defaultSettings);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('sets filePath from the TFile path', () => {
      const file = new TFile('vault/notes/test.md');
      const chunks = service.chunkNote(file, 'Some content here.', defaultSettings);
      expect(chunks.every((c) => c.filePath === 'vault/notes/test.md')).toBe(true);
    });

    it('uses basename without extension for title', () => {
      const file = new TFile('My Document.md');
      const chunks = service.chunkNote(file, 'Content here.', defaultSettings);
      expect(chunks[0]?.content).toMatch(/^My Document\n/);
    });
  });

  describe('embedChunks', () => {
    it('calls embed for each chunk and returns EmbeddedChunks', async () => {
      const file = new TFile('a.md');
      const chunks = service.chunkNote(file, 'Content.', defaultSettings);
      const embedded = await service.embedChunks(chunks);
      expect(embedded).toHaveLength(chunks.length);
      expect(embedded[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(mockClient.embed).toHaveBeenCalledTimes(chunks.length);
    });
  });
});
