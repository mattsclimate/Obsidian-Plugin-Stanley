import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIProviderManager } from '../src/services/AIProviderManager';
import type { StanleySettings } from '../src/settings';

describe('AIProviderManager', () => {
  let settings: StanleySettings;
  let manager: AIProviderManager;

  beforeEach(() => {
    settings = {
      ollamaBaseUrl: 'http://localhost:11434',
      embeddingModel: 'nomic-embed-text',
      chatModel: 'llama3',
      aiProvider: 'ollama',
      embeddingProvider: 'ollama',
      anthropicApiKey: 'sk-ant-testkey',
      chatModelAnthropic: 'claude-3-5-haiku-latest',
      geminiApiKey: 'AIzaSy-testkey',
      chatModelGemini: 'gemini-2.5-flash',
      openaiApiKey: 'sk-proj-testkey',
      cohereApiKey: 'co-testkey',
      vectorStoreStorage: 'memory-standard',
    } as unknown as StanleySettings;
    manager = new AIProviderManager(settings);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkHealth', () => {
    it('returns true for anthropic if key is set', async () => {
      settings.aiProvider = 'anthropic';
      const result = await manager.checkHealth();
      expect(result).toBe(true);
    });

    it('returns false for anthropic if key is empty', async () => {
      settings.aiProvider = 'anthropic';
      settings.anthropicApiKey = '';
      const result = await manager.checkHealth();
      expect(result).toBe(false);
    });

    it('returns true for gemini if key is set', async () => {
      settings.aiProvider = 'gemini';
      const result = await manager.checkHealth();
      expect(result).toBe(true);
    });

    it('returns false for gemini if key is empty', async () => {
      settings.aiProvider = 'gemini';
      settings.geminiApiKey = '';
      const result = await manager.checkHealth();
      expect(result).toBe(false);
    });
  });

  describe('embed API calls', () => {
    it('calls Google Gemini embedding API correctly', async () => {
      settings.embeddingProvider = 'gemini';
      const mockVector = [0.1, 0.2, 0.3];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: { values: mockVector } }),
      }));

      const result = await manager.embed('hello gemini');
      expect(result).toEqual(mockVector);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: 'hello gemini' }] }
          })
        })
      );
    });

    it('calls OpenAI embedding API correctly', async () => {
      settings.embeddingProvider = 'openai';
      const mockVector = [0.4, 0.5, 0.6];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: mockVector }] }),
      }));

      const result = await manager.embed('hello openai');
      expect(result).toEqual(mockVector);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-proj-testkey'
          }),
          body: JSON.stringify({
            input: 'hello openai',
            model: 'text-embedding-3-small'
          })
        })
      );
    });

    it('calls Cohere embedding API correctly', async () => {
      settings.embeddingProvider = 'cohere';
      const mockVector = [0.7, 0.8, 0.9];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [mockVector] }),
      }));

      const result = await manager.embed('hello cohere');
      expect(result).toEqual(mockVector);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.cohere.com/v1/embed',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer co-testkey'
          }),
          body: JSON.stringify({
            texts: ['hello cohere'],
            model: 'embed-english-v3.0',
            input_type: 'search_document'
          })
        })
      );
    });
  });

  describe('chat streaming API calls', () => {
    it('handles Anthropic chat request & streams response', async () => {
      settings.aiProvider = 'anthropic';
      
      const chunks = [
        'event: content_block_delta\n',
        'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}}\n',
        'event: content_block_delta\n',
        'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": " Claude"}}\n',
        'event: message_delta\n',
        'data: {"type": "message_delta", "usage": {"output_tokens": 10}}\n',
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            return {
              done: false,
              value: new TextEncoder().encode(chunks[chunkIndex++]),
            };
          }
          return { done: true, value: undefined };
        }),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      }));

      const tokens: string[] = [];
      const result = await manager.chat(
        [{ role: 'user', content: 'test request', timestamp: 0 }],
        (t) => tokens.push(t)
      );

      expect(tokens).toEqual(['Hello', ' Claude']);
      expect(result.response).toBe('Hello Claude');
      expect(result.tokenCount).toBe(10);
    });

    it('handles Gemini chat request & streams response', async () => {
      settings.aiProvider = 'gemini';
      
      const chunks = [
        'data: {"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}\n',
        'data: {"candidates": [{"content": {"parts": [{"text": " Gemini"}]}}], "usageMetadata": {"candidatesTokenCount": 8}}\n',
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            return {
              done: false,
              value: new TextEncoder().encode(chunks[chunkIndex++]),
            };
          }
          return { done: true, value: undefined };
        }),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      }));

      const tokens: string[] = [];
      const result = await manager.chat(
        [{ role: 'user', content: 'test request', timestamp: 0 }],
        (t) => tokens.push(t)
      );

      expect(tokens).toEqual(['Hello', ' Gemini']);
      expect(result.response).toBe('Hello Gemini');
      expect(result.tokenCount).toBe(8);
    });
  });
});
