import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGEngine } from '../src/services/RAGEngine';
import type { OllamaClient } from '../src/services/OllamaClient';
import type { VectorStore } from '../src/services/VectorStore';
import type { PerformanceMonitor } from '../src/services/PerformanceMonitor';
import { ModelRouter } from '../src/services/ModelRouter';
import { MemPalaceService } from '../src/services/MemPalaceService';
import type { CloudModelClient } from '../src/services/CloudModelClient';
import type { StanleySettings } from '../src/settings';
import type { EmbeddedChunk } from '../src/types';

const settings: StanleySettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text',
  chatModel: 'llama3',
  selectedChatModel: { provider: 'local', model: 'llama3', label: 'llama3' },
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 3,
  maxContextTokens: 4096,
  autoTuneEnabled: false,
  fileModTimes: {},
  extendedThinking: false,
  showStats: false,
  cloudEnabled: false,
  cloudProvider: 'anthropic',
  cloudApiKeys: { anthropic: '', google: '', openai: '' },
  surfaceGoMode: true,
  batterySaverMode: false,
  cloudOnlyOnWifi: true,
  mempalaceEnabled: true,
  onboardingCompleted: false,
  workspaceMode: 'daily',
};

function makeChunk(filePath: string, content: string): EmbeddedChunk {
  return { filePath, content, charOffset: 0, embedding: [0.1] };
}

describe('RAGEngine', () => {
  let mockClient: OllamaClient;
  let mockStore: VectorStore;
  let mockMonitor: PerformanceMonitor;
  let engine: RAGEngine;

  beforeEach(() => {
    mockClient = {
      embed: vi.fn().mockResolvedValue([0.5, 0.5]),
      chat: vi.fn().mockResolvedValue({ response: 'Test answer', tokenCount: 42 }),
    } as unknown as OllamaClient;

    mockStore = {
      search: vi.fn().mockReturnValue([
        makeChunk('note-a.md', 'Context from note A'),
        makeChunk('note-b.md', 'Context from note B'),
      ]),
    } as unknown as VectorStore;

    mockMonitor = {
      recordQuery: vi.fn(),
      maybeAutoTune: vi.fn().mockImplementation((s) => s),
    } as unknown as PerformanceMonitor;

    engine = new RAGEngine(mockClient, mockStore, mockMonitor);
  });

  it('embeds the user query', async () => {
    await engine.query('What is X?', settings, () => {});
    expect(mockClient.embed).toHaveBeenCalledWith('What is X?');
  });

  it('searches the vector store with query embedding and topK', async () => {
    await engine.query('What is X?', settings, () => {});
    expect(mockStore.search).toHaveBeenCalledWith([0.5, 0.5], settings.topK);
  });

  it('passes wikilink citations in the chat messages', async () => {
    await engine.query('What is X?', settings, () => {});
    const chatCall = vi.mocked(mockClient.chat).mock.calls[0];
    const messages = chatCall?.[0];
    const systemMessage = messages?.find((m) => m.role === 'user');
    expect(systemMessage?.content).toContain('[[note-a]]');
    expect(systemMessage?.content).toContain('[[note-b]]');
  });

  it('passes the user query in the chat messages', async () => {
    await engine.query('What is X?', settings, () => {});
    const chatCall = vi.mocked(mockClient.chat).mock.calls[0];
    const messages = chatCall?.[0];
    const lastMessage = messages?.[messages.length - 1];
    expect(lastMessage?.content).toContain('What is X?');
  });

  it('returns the full response from OllamaClient.chat', async () => {
    const result = await engine.query('What is X?', settings, () => {});
    expect(result.response).toBe('Test answer');
  });

  it('calls recordQuery on the monitor', async () => {
    await engine.query('What is X?', settings, () => {});
    expect(mockMonitor.recordQuery).toHaveBeenCalled();
  });

  it('calls maybeAutoTune and returns potentially updated settings', async () => {
    const tunedSettings = { ...settings, topK: 4 };
    vi.mocked(mockMonitor.maybeAutoTune).mockReturnValue(tunedSettings);
    const result = await engine.query('What is X?', settings, () => {});
    expect(result.settings.topK).toBe(4);
  });

  it('streams tokens via the onToken callback', async () => {
    vi.mocked(mockClient.chat).mockImplementation(async (_msgs, onToken) => {
      onToken('Hello');
      onToken(' there');
      return { response: 'Hello there', tokenCount: 5 };
    });
    const tokens: string[] = [];
    await engine.query('hi', settings, (t) => tokens.push(t));
    expect(tokens).toEqual(['Hello', ' there']);
  });

  it('returns a cloud context preview without calling a cloud provider before approval', async () => {
    const cloudClient = { complete: vi.fn() } as unknown as CloudModelClient;
    const cloudEngine = new RAGEngine(
      mockClient,
      mockStore,
      mockMonitor,
      new ModelRouter(),
      cloudClient,
      new MemPalaceService()
    );
    const cloudSettings = {
      ...settings,
      cloudEnabled: true,
      selectedChatModel: { provider: 'anthropic' as const, model: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      cloudApiKeys: { anthropic: 'sk-ant', google: '', openai: '' },
    };

    const result = await cloudEngine.query('draft a long plan', cloudSettings, () => {}, [], {
      cloudApprovedForRequest: false,
      wifiConnected: true,
      mempalaceContent: '- 2026-07-03T12:00:00.000Z | planning | Created daily plan note | tags: daily, plan',
    });

    expect(result.response).toContain('Cloud context preview');
    expect(result.response).toContain('Claude Sonnet 5');
    expect(result.response).toContain('Created daily plan note');
    expect(cloudClient.complete).not.toHaveBeenCalled();
    expect(mockClient.chat).not.toHaveBeenCalled();
  });
});
