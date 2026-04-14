import type { ChatMessage } from '../types';

export class OllamaClient {
  constructor(
    private baseUrl: string,
    public embeddingModel: string,
    public chatModel: string
  ) {}

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`Ollama tags failed: ${res.status}`);
    const data = await res.json() as { models: Array<{ name: string }> };
    return data.models.map((m) => m.name).sort();
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, prompt: text }),
    });
    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
    const data = await res.json() as { embedding?: number[] };
    if (!Array.isArray(data.embedding)) {
      throw new Error('Ollama embed: missing embedding in response');
    }
    return data.embedding;
  }

  async chat(
    messages: ChatMessage[],
    onToken: (token: string) => void
  ): Promise<{ response: string; tokenCount: number }> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.chatModel,
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: true,
      }),
    });
    if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`);
    if (!res.body) throw new Error('No response body from Ollama');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let tokenCount = 0;
    let lineBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content: string };
            done: boolean;
            eval_count?: number;
          };
          if (parsed.message?.content) {
            fullResponse += parsed.message.content;
            onToken(parsed.message.content);
          }
          if (parsed.done && parsed.eval_count != null) {
            tokenCount = parsed.eval_count;
          }
        } catch { /* skip malformed NDJSON lines */ }
      }
    }

    return { response: fullResponse, tokenCount };
  }
}
