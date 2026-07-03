import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudModelClient } from '../src/services/CloudModelClient';

describe('CloudModelClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requires an API key for cloud requests', async () => {
    const client = new CloudModelClient();

    await expect(client.complete({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      apiKey: '',
      prompt: 'Hello',
    })).rejects.toThrow('Missing API key for anthropic');
  });

  it('formats Anthropic messages requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Claude response' }] }),
    });
    const client = new CloudModelClient(fetchMock as unknown as typeof fetch);

    await expect(client.complete({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      apiKey: 'sk-ant',
      prompt: 'Hello',
    })).resolves.toBe('Claude response');

    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-api-key': 'sk-ant' }),
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    }));
  });

  it('formats Gemini generateContent requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }] }),
    });
    const client = new CloudModelClient(fetchMock as unknown as typeof fetch);

    await expect(client.complete({
      provider: 'google',
      model: 'gemini-3.5-flash',
      apiKey: 'google-key',
      prompt: 'Hello',
    })).resolves.toBe('Gemini response');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=google-key',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] }),
      })
    );
  });

  it('formats OpenAI responses requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'OpenAI response' }),
    });
    const client = new CloudModelClient(fetchMock as unknown as typeof fetch);

    await expect(client.complete({
      provider: 'openai',
      model: 'gpt-5.5',
      apiKey: 'sk-openai',
      prompt: 'Hello',
    })).resolves.toBe('OpenAI response');

    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer sk-openai' }),
      body: JSON.stringify({
        model: 'gpt-5.5',
        input: 'Hello',
        max_output_tokens: 4096,
      }),
    }));
  });
});
