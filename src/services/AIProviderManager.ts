import type { ChatMessage } from '../types';
import type { StanleySettings } from '../settings';
import { OllamaClient } from './OllamaClient';

export class AIProviderManager {
  private ollamaClient: OllamaClient;

  constructor(
    private settings: StanleySettings
  ) {
    this.ollamaClient = new OllamaClient(
      this.settings.ollamaBaseUrl,
      this.settings.embeddingModel,
      this.settings.chatModel
    );
  }

  // Allow setting updates dynamically
  updateSettings(settings: StanleySettings): void {
    this.settings = settings;
    this.ollamaClient.chatModel = settings.chatModel;
    this.ollamaClient.embeddingModel = settings.embeddingModel;
  }

  async checkHealth(): Promise<boolean> {
    const provider = this.settings.aiProvider;
    if (provider === 'ollama') {
      return this.ollamaClient.checkHealth();
    }
    if (provider === 'anthropic') {
      return this.settings.anthropicApiKey.trim().length > 0;
    }
    if (provider === 'gemini') {
      return this.settings.geminiApiKey.trim().length > 0;
    }
    return false;
  }

  async listModels(): Promise<string[]> {
    const provider = this.settings.aiProvider;
    if (provider === 'ollama') {
      return this.ollamaClient.listModels();
    }
    if (provider === 'anthropic') {
      return ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'];
    }
    if (provider === 'gemini') {
      return ['gemini-2.5-flash', 'gemini-2.5-pro'];
    }
    return [];
  }

  async embed(text: string): Promise<number[]> {
    const provider = this.settings.embeddingProvider;
    if (provider === 'ollama') {
      return this.ollamaClient.embed(text);
    }
    if (provider === 'gemini') {
      return this.embedGemini(text);
    }
    if (provider === 'openai') {
      return this.embedOpenAI(text);
    }
    if (provider === 'cohere') {
      return this.embedCohere(text);
    }
    throw new Error(`Unsupported embedding provider: ${provider}`);
  }

  async chat(
    messages: ChatMessage[],
    onToken: (token: string) => void
  ): Promise<{ response: string; tokenCount: number }> {
    const provider = this.settings.aiProvider;
    if (provider === 'ollama') {
      return this.ollamaClient.chat(messages, onToken);
    }
    if (provider === 'anthropic') {
      return this.chatAnthropic(messages, onToken);
    }
    if (provider === 'gemini') {
      return this.chatGemini(messages, onToken);
    }
    throw new Error(`Unsupported chat provider: ${provider}`);
  }

  // --- EMBEDDING IMPLEMENTATIONS ---

  private async embedGemini(text: string): Promise<number[]> {
    const apiKey = this.settings.geminiApiKey;
    if (!apiKey) throw new Error('Gemini API key is missing');
    const model = 'text-embedding-004';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${model}`,
        content: {
          parts: [{ text }]
        }
      })
    });

    if (!res.ok) {
      throw new Error(`Gemini embed failed with status ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as { embedding?: { values: number[] } };
    if (!data.embedding?.values) {
      throw new Error('Gemini embed response missing embedding values');
    }
    return data.embedding.values;
  }

  private async embedOpenAI(text: string): Promise<number[]> {
    const apiKey = this.settings.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API key is missing');
    const url = 'https://api.openai.com/v1/embeddings';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small'
      })
    });

    if (!res.ok) {
      throw new Error(`OpenAI embed failed with status ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as { data?: Array<{ embedding: number[] }> };
    const embedding = data.data?.[0]?.embedding;
    if (!embedding) {
      throw new Error('OpenAI embed response missing embedding data');
    }
    return embedding;
  }

  private async embedCohere(text: string): Promise<number[]> {
    const apiKey = this.settings.cohereApiKey;
    if (!apiKey) throw new Error('Cohere API key is missing');
    const url = 'https://api.cohere.com/v1/embed';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        texts: [text],
        model: 'embed-english-v3.0',
        input_type: 'search_document'
      })
    });

    if (!res.ok) {
      throw new Error(`Cohere embed failed with status ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as { embeddings?: number[][] };
    const embedding = data.embeddings?.[0];
    if (!embedding) {
      throw new Error('Cohere embed response missing embedding values');
    }
    return embedding;
  }

  // --- CHAT IMPLEMENTATIONS ---

  private async chatAnthropic(
    messages: ChatMessage[],
    onToken: (token: string) => void
  ): Promise<{ response: string; tokenCount: number }> {
    const apiKey = this.settings.anthropicApiKey;
    if (!apiKey) throw new Error('Anthropic API key is missing');
    const model = this.settings.chatModelAnthropic;
    const url = 'https://api.anthropic.com/v1/messages';

    // Anthropic messages API does not support roles other than user/assistant.
    // If a system prompt is built in, Anthropic requires it to be a top-level body parameter.
    // However, in our system, RAGEngine builds a single large 'user' prompt containing the system instructions.
    // So we can send it directly.
    const anthropicMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        messages: anthropicMessages,
        max_tokens: 4096,
        stream: true
      })
    });

    if (!res.ok) {
      throw new Error(`Anthropic chat failed with status ${res.status}: ${await res.text()}`);
    }
    if (!res.body) throw new Error('Anthropic response body is empty');

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
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.substring(5).trim();
        if (jsonStr === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(jsonStr) as {
            type: string;
            delta?: { text?: string };
            message?: { usage?: { output_tokens?: number } };
            usage?: { output_tokens?: number };
          };
          
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            const text = parsed.delta.text;
            fullResponse += text;
            onToken(text);
          }
          if (parsed.usage?.output_tokens != null) {
            tokenCount = parsed.usage.output_tokens;
          } else if (parsed.message?.usage?.output_tokens != null) {
            tokenCount = parsed.message.usage.output_tokens;
          }
        } catch { /* ignore malformed JSON */ }
      }
    }

    if (tokenCount === 0) {
      tokenCount = Math.ceil(fullResponse.length / 4);
    }

    return { response: fullResponse, tokenCount };
  }

  private async chatGemini(
    messages: ChatMessage[],
    onToken: (token: string) => void
  ): Promise<{ response: string; tokenCount: number }> {
    const apiKey = this.settings.geminiApiKey;
    if (!apiKey) throw new Error('Gemini API key is missing');
    const model = this.settings.chatModelGemini;
    
    // Use alt=sse for standard EventSource format
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    if (!res.ok) {
      throw new Error(`Gemini chat failed with status ${res.status}: ${await res.text()}`);
    }
    if (!res.body) throw new Error('Gemini response body is empty');

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
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.substring(5).trim();

        try {
          const parsed = JSON.parse(jsonStr) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
            }>;
            usageMetadata?: {
              candidatesTokenCount?: number;
            };
          };

          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullResponse += text;
            onToken(text);
          }
          if (parsed.usageMetadata?.candidatesTokenCount != null) {
            tokenCount = parsed.usageMetadata.candidatesTokenCount;
          }
        } catch { /* ignore malformed JSON */ }
      }
    }

    if (tokenCount === 0) {
      tokenCount = Math.ceil(fullResponse.length / 4);
    }

    return { response: fullResponse, tokenCount };
  }
}
