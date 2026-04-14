import type { TFile } from 'obsidian';
import type { OllamaClient } from './OllamaClient';
import type { Chunk, EmbeddedChunk } from '../types';
import type { StanleySettings } from '../settings';

export class EmbeddingService {
  constructor(private client: OllamaClient) {}

  chunkNote(file: TFile, content: string, settings: StanleySettings): Chunk[] {
    if (!content.trim()) return [];

    const title = file.basename;
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let charOffset = 0;

    for (const para of paragraphs) {
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
    return Promise.all(
      chunks.map(async (chunk) => ({
        ...chunk,
        embedding: await this.client.embed(chunk.content),
      }))
    );
  }
}
