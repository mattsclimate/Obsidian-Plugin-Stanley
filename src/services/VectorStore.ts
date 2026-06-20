import type { EmbeddedChunk } from '../types';
import type { StanleySettings } from '../settings';

function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let dot = 0, magA = 0, magB = 0;
  const len = a.length;
  for (let i = 0; i < len; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dot += valA * valB;
    magA += valA ** 2;
    magB += valB ** 2;
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

export class VectorStore {
  private chunks: EmbeddedChunk[] = [];

  constructor(private settings: StanleySettings) {}

  get size(): number {
    return this.chunks.length;
  }

  insert(chunks: EmbeddedChunk[]): void {
    const storageType = this.settings.vectorStoreStorage;
    if (storageType === 'pinecone') {
      void this.upsertPinecone(chunks);
      return;
    }

    const processed = chunks.map((chunk) => {
      if (storageType === 'memory-compressed') {
        return {
          ...chunk,
          embedding: new Float32Array(chunk.embedding) as unknown as number[],
        };
      }
      return chunk;
    });
    this.chunks = this.chunks.concat(processed);
  }

  removeByFile(filePath: string): void {
    const storageType = this.settings.vectorStoreStorage;
    if (storageType === 'pinecone') {
      void this.deletePineconeByFile(filePath);
      return;
    }

    this.chunks = this.chunks.filter((c) => c.filePath !== filePath);
  }

  async search(queryEmbedding: number[], topK: number): Promise<EmbeddedChunk[]> {
    const storageType = this.settings.vectorStoreStorage;
    if (storageType === 'pinecone') {
      return this.searchPinecone(queryEmbedding, topK);
    }

    return this.chunks
      .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk }) => chunk);
  }

  clear(): void {
    const storageType = this.settings.vectorStoreStorage;
    if (storageType === 'pinecone') {
      void this.clearPinecone();
      return;
    }

    this.chunks = [];
  }

  // --- PINECONE INTEGRATION ---

  private getChunkId(chunk: { filePath: string; charOffset: number }): string {
    // Pinecone IDs must contain only ASCII characters. Base64 encode the path to be safe.
    const encodedPath = btoa(encodeURIComponent(chunk.filePath));
    return `${encodedPath}_${chunk.charOffset}`;
  }

  private decodeChunkId(id: string): { filePath: string; charOffset: number } {
    const parts = id.split('_');
    const encodedPath = parts[0] || '';
    const charOffset = parseInt(parts[1] || '0', 10);
    const filePath = decodeURIComponent(atob(encodedPath));
    return { filePath, charOffset };
  }

  private async upsertPinecone(chunks: EmbeddedChunk[]): Promise<void> {
    const apiKey = this.settings.pineconeApiKey;
    const host = this.settings.pineconeHost;
    if (!apiKey || !host) {
      console.warn('Stanley: Pinecone API key or Host URL is missing. Upsert skipped.');
      return;
    }

    const url = `${host.replace(/\/$/, '')}/vectors/upsert`;
    const vectors = chunks.map((chunk) => ({
      id: this.getChunkId(chunk),
      values: chunk.embedding,
      metadata: {
        filePath: chunk.filePath,
        content: chunk.content,
        charOffset: chunk.charOffset,
      },
    }));

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': apiKey,
        },
        body: JSON.stringify({ vectors }),
      });
      if (!res.ok) {
        console.error(`Stanley: Pinecone upsert failed: ${res.status} — ${await res.text()}`);
      }
    } catch (err) {
      console.error('Stanley: Pinecone upsert connection error:', err);
    }
  }

  private async deletePineconeByFile(filePath: string): Promise<void> {
    const apiKey = this.settings.pineconeApiKey;
    const host = this.settings.pineconeHost;
    if (!apiKey || !host) return;

    const url = `${host.replace(/\/$/, '')}/vectors/delete`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': apiKey,
        },
        body: JSON.stringify({
          filter: {
            filePath: { $eq: filePath },
          },
        }),
      });
      if (!res.ok) {
        console.error(`Stanley: Pinecone delete failed: ${res.status}`);
      }
    } catch (err) {
      console.error('Stanley: Pinecone delete error:', err);
    }
  }

  private async clearPinecone(): Promise<void> {
    const apiKey = this.settings.pineconeApiKey;
    const host = this.settings.pineconeHost;
    if (!apiKey || !host) return;

    const url = `${host.replace(/\/$/, '')}/vectors/delete`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': apiKey,
        },
        body: JSON.stringify({ deleteAll: true }),
      });
      if (!res.ok) {
        console.error(`Stanley: Pinecone clear failed: ${res.status}`);
      }
    } catch (err) {
      console.error('Stanley: Pinecone clear error:', err);
    }
  }

  private async searchPinecone(queryEmbedding: number[], topK: number): Promise<EmbeddedChunk[]> {
    const apiKey = this.settings.pineconeApiKey;
    const host = this.settings.pineconeHost;
    if (!apiKey || !host) {
      console.warn('Stanley: Pinecone API key or Host URL is missing. Return empty search results.');
      return [];
    }

    const url = `${host.replace(/\/$/, '')}/query`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': apiKey,
        },
        body: JSON.stringify({
          vector: queryEmbedding,
          topK,
          includeMetadata: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`Pinecone query failed with status ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as {
        matches?: Array<{
          id: string;
          score: number;
          metadata?: {
            filePath?: string;
            content?: string;
            charOffset?: number;
          };
        }>;
      };

      const matches = data.matches || [];
      return matches.map((m) => {
        const metadata = m.metadata || {};
        const decoded = this.decodeChunkId(m.id);
        return {
          filePath: metadata.filePath || decoded.filePath,
          content: metadata.content || '',
          charOffset: metadata.charOffset != null ? metadata.charOffset : decoded.charOffset,
          embedding: [], // embedding values not needed for RAG prompt construction
        };
      });
    } catch (err) {
      console.error('Stanley: Pinecone search error:', err);
      return [];
    }
  }
}
