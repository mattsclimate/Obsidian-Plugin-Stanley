import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaClient } from '../src/services/OllamaClient';

describe('OllamaClient', () => {
  let client: OllamaClient;

  beforeEach(() => {
    client = new OllamaClient('http://localhost:11434', 'nomic-embed-text', 'llama3');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkHealth', () => {
    it('returns true when Ollama is reachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const result = await client.checkHealth();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags');
    });

    it('returns false when Ollama is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const result = await client.checkHealth();
      expect(result).toBe(false);
    });

    it('returns false when response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const result = await client.checkHealth();
      expect(result).toBe(false);
    });
  });

  describe('embed', () => {
    it('returns an embedding vector', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: mockEmbedding }),
      }));
      const result = await client.embed('hello world');
      expect(result).toEqual(mockEmbedding);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ model: 'nomic-embed-text', prompt: 'hello world' }),
        })
      );
    });

    it('throws when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await expect(client.embed('test')).rejects.toThrow('Ollama embed failed: 500');
    });
  });

  describe('chat', () => {
    it('streams tokens and returns full response with token count', async () => {
      const chunks = [
        '{"message":{"role":"assistant","content":"Hello"},"done":false}\n',
        '{"message":{"role":"assistant","content":" world"},"done":false}\n',
        '{"message":{"role":"assistant","content":""},"done":true,"eval_count":5}\n',
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
      const result = await client.chat(
        [{ role: 'user', content: 'hi', timestamp: 0 }],
        (t) => tokens.push(t)
      );

      expect(tokens).toEqual(['Hello', ' world']);
      expect(result.response).toBe('Hello world');
      expect(result.tokenCount).toBe(5);
    });

    it('throws when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
      await expect(
        client.chat([{ role: 'user', content: 'hi', timestamp: 0 }], () => {})
      ).rejects.toThrow('Ollama chat failed: 503');
    });
  });
});
