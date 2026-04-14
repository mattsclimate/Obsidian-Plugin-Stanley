import type { StanleySettings } from '../settings';
import type { PerformanceStats } from '../types';

interface QueryRecord {
  totalLatencyMs: number;
  tokens: number;
  maxTokens: number;
}

export class PerformanceMonitor {
  private queryBuffer: QueryRecord[] = [];
  private allQueries: QueryRecord[] = [];
  private lastIndexDurationMs = 0;
  private cacheHitRate = 0;
  private indexedChunkCount = 0;

  recordQuery(
    embedMs: number,
    retrieveMs: number,
    generateMs: number,
    tokens: number,
    maxContextTokens: number
  ): void {
    const record: QueryRecord = {
      totalLatencyMs: embedMs + retrieveMs + generateMs,
      tokens,
      maxTokens: maxContextTokens,
    };
    this.queryBuffer.push(record);
    this.allQueries.push(record);
  }

  recordIndex(chunkCount: number, durationMs: number, cacheHitRate: number): void {
    this.indexedChunkCount = chunkCount;
    this.lastIndexDurationMs = durationMs;
    this.cacheHitRate = cacheHitRate;
  }

  getStats(): PerformanceStats {
    const totalLatency = this.allQueries.reduce((s, q) => s + q.totalLatencyMs, 0);
    const avgQueryLatencyMs =
      this.allQueries.length > 0 ? totalLatency / this.allQueries.length : 0;
    const totalTokensUsed = this.allQueries.reduce((s, q) => s + q.tokens, 0);

    return {
      lastIndexDurationMs: this.lastIndexDurationMs,
      avgQueryLatencyMs,
      totalTokensUsed,
      indexedChunkCount: this.indexedChunkCount,
      cacheHitRate: this.cacheHitRate,
    };
  }

  maybeAutoTune(settings: StanleySettings): StanleySettings {
    if (!settings.autoTuneEnabled) return settings;
    if (this.queryBuffer.length < 10) return settings;

    const buffer = this.queryBuffer.slice(-10);
    this.queryBuffer = [];

    const avgLatency = buffer.reduce((s, q) => s + q.totalLatencyMs, 0) / buffer.length;
    const highTokenCount = buffer.filter((q) => q.tokens / q.maxTokens >= 0.95).length;

    const updated = { ...settings };

    if (avgLatency > 8000 && updated.topK > 3) {
      updated.topK -= 1;
    } else if (avgLatency < 2000 && updated.topK < 10) {
      updated.topK += 1;
    }

    if (highTokenCount >= 3 && updated.chunkSize > 200) {
      updated.chunkSize -= 50;
    }

    return updated;
  }
}
