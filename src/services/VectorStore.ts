import type { EmbeddedChunk } from '../types';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

export class VectorStore {
  private chunks: EmbeddedChunk[] = [];

  get size(): number {
    return this.chunks.length;
  }

  insert(chunks: EmbeddedChunk[]): void {
    this.chunks = this.chunks.concat(chunks);
  }

  removeByFile(filePath: string): void {
    this.chunks = this.chunks.filter((c) => c.filePath !== filePath);
  }

  search(queryEmbedding: number[], topK: number): EmbeddedChunk[] {
    return this.chunks
      .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk }) => chunk);
  }

  clear(): void {
    this.chunks = [];
  }
}
