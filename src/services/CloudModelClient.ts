import type { ChatModelProvider } from '../settings';

export interface CloudCompletionRequest {
  provider: Exclude<ChatModelProvider, 'local'>;
  model: string;
  apiKey: string;
  prompt: string;
  maxTokens?: number;
}

export class CloudModelClient {
  constructor(private fetcher: typeof fetch = fetch) {}

  async complete(request: CloudCompletionRequest): Promise<string> {
    if (!request.apiKey.trim()) {
      throw new Error(`Missing API key for ${request.provider}`);
    }

    if (request.provider === 'anthropic') return this.completeAnthropic(request);
    if (request.provider === 'google') return this.completeGoogle(request);
    return this.completeOpenAI(request);
  }

  private async completeAnthropic(request: CloudCompletionRequest): Promise<string> {
    const res = await this.fetcher('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': request.apiKey,
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });
    const data = await this.readJson(res);
    const text = data.content?.find((part: { type?: string; text?: string }) => part.type === 'text')?.text;
    if (!text) throw new Error('Anthropic response did not include text');
    return text;
  }

  private async completeGoogle(request: CloudCompletionRequest): Promise<string> {
    const res = await this.fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: request.prompt }] }] }),
      }
    );
    const data = await this.readJson(res);
    const text = data.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
    if (!text) throw new Error('Gemini response did not include text');
    return text;
  }

  private async completeOpenAI(request: CloudCompletionRequest): Promise<string> {
    const res = await this.fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        input: request.prompt,
        max_output_tokens: request.maxTokens ?? 4096,
      }),
    });
    const data = await this.readJson(res);
    if (typeof data.output_text === 'string') return data.output_text;
    const text = data.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
      .find((part: { text?: string }) => part.text)?.text;
    if (!text) throw new Error('OpenAI response did not include text');
    return text;
  }

  private async readJson(res: Response): Promise<any> {
    const data = await res.json();
    if (!res.ok) {
      const message = data?.error?.message ?? `Cloud request failed: ${res.status}`;
      throw new Error(message);
    }
    return data;
  }
}
