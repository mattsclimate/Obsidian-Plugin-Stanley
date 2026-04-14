export interface Chunk {
  filePath: string;
  content: string;
  charOffset: number;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface PerformanceStats {
  lastIndexDurationMs: number;
  avgQueryLatencyMs: number;
  totalTokensUsed: number;
  indexedChunkCount: number;
  cacheHitRate: number;
}
