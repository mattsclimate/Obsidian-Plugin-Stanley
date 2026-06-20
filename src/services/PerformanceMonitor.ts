import type { StanleySettings } from '../settings';
import type { PerformanceStats } from '../types';
import type { IndexManager } from './IndexManager';

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

  // Lag detection properties
  private indexManager?: IndexManager;
  private lagCheckInterval: any = null;
  private consecutiveStableTicks = 0;
  private isPausedByLag = false;

  setIndexManager(indexManager: IndexManager): void {
    this.indexManager = indexManager;
    this.startLagDetection();
  }

  cleanup(): void {
    if (this.lagCheckInterval) {
      clearInterval(this.lagCheckInterval);
      this.lagCheckInterval = null;
    }
  }

  private startLagDetection(): void {
    if (this.lagCheckInterval) clearInterval(this.lagCheckInterval);

    let lastTime = Date.now();
    this.lagCheckInterval = setInterval(() => {
      const now = Date.now();
      const dispatchTime = now - lastTime;
      // standard expected interval is 100ms. Any dispatchTime > 150ms implies >50ms lag.
      const lag = dispatchTime - 100;
      lastTime = now;

      if (lag > 100) { // Large spike in UI latency/event loop lag
        this.consecutiveStableTicks = 0;
        if (!this.isPausedByLag && this.indexManager) {
          console.warn(`Stanley: UI latency detected (${lag}ms lag). Pausing background tasks.`);
          this.isPausedByLag = true;
          this.indexManager.pause();
        }
      } else if (lag < 30) {
        if (this.isPausedByLag) {
          this.consecutiveStableTicks++;
          if (this.consecutiveStableTicks >= 10 && this.indexManager) { // Stable for 1 second (10 * 100ms)
            console.log('Stanley: UI stabilized. Resuming background tasks.');
            this.isPausedByLag = false;
            this.indexManager.resume();
          }
        }
      } else {
        this.consecutiveStableTicks = 0;
      }
    }, 100);
  }

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

    // If query latency is massive (> 8 seconds) and indexer is running, pause it to save resources
    const totalLatency = embedMs + retrieveMs + generateMs;
    if (totalLatency > 8000 && this.indexManager && !this.isPausedByLag) {
      console.warn(`Stanley: High query latency (${totalLatency}ms). Throttling background indexer.`);
      this.isPausedByLag = true;
      this.indexManager.pause();
      
      // Auto-resume after 20 seconds
      setTimeout(() => {
        if (this.isPausedByLag && this.indexManager) {
          this.isPausedByLag = false;
          this.indexManager.resume();
        }
      }, 20000);
    }
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
