import type { TFile } from 'obsidian';
import type { AIProviderManager } from './AIProviderManager';
import type { Chunk, EmbeddedChunk } from '../types';
import type { StanleySettings } from '../settings';

export class EmbeddingService {
  constructor(private client: AIProviderManager) {}

  async chunkNote(file: TFile, content: string, settings: StanleySettings): Promise<Chunk[]> {
    if (!content.trim()) return [];

    const title = file.basename;
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let charOffset = 0;
    let count = 0;

    for (const para of paragraphs) {
      // Yield to the main thread periodically for large files to prevent UI locking
      if (count++ % 20 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }

      const candidate = currentChunk ? currentChunk + '\n\n' + para : para;

      if (candidate.length > settings.chunkSize && currentChunk.length > 0) {
        chunks.push({
          filePath: file.path,
          content: `${title}\n${currentChunk.trim()}`,
          charOffset,
        });
        charOffset += currentChunk.length;
        // Carry forward overlap
        const overlap = currentChunk.slice(-settings.chunkOverlap);
        currentChunk = overlap + '\n\n' + para;
      } else {
        currentChunk = candidate;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        filePath: file.path,
        content: `${title}\n${currentChunk.trim()}`,
        charOffset,
      });
    }

    return chunks;
  }

  async embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
    const results: EmbeddedChunk[] = [];
    for (const chunk of chunks) {
      const embedding = await this.client.embed(chunk.content);
      results.push({
        ...chunk,
        embedding,
      });
      // Add a polite delay for free-tier APIs (e.g., 300ms) to prevent Rate Limit Tsunami (HTTP 429)
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return results;
  }
}
