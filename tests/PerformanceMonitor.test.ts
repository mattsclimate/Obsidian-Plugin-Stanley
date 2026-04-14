import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceMonitor } from '../src/services/PerformanceMonitor';
import type { StanleySettings } from '../src/settings';

const baseSettings: StanleySettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text',
  chatModel: 'llama3',
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 5,
  maxContextTokens: 4096,
  autoTuneEnabled: true,
  fileModTimes: {},
};

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  describe('getStats', () => {
    it('returns zeroed stats initially', () => {
      const stats = monitor.getStats();
      expect(stats.avgQueryLatencyMs).toBe(0);
      expect(stats.totalTokensUsed).toBe(0);
      expect(stats.indexedChunkCount).toBe(0);
      expect(stats.cacheHitRate).toBe(0);
      expect(stats.lastIndexDurationMs).toBe(0);
    });
  });

  describe('recordQuery', () => {
    it('accumulates token counts', () => {
      monitor.recordQuery(100, 50, 2000, 150, 500);
      monitor.recordQuery(120, 60, 1800, 120, 480);
      expect(monitor.getStats().totalTokensUsed).toBe(270);
    });

    it('computes average query latency across all recorded queries', () => {
      // total latency = embedMs + retrieveMs + generateMs
      monitor.recordQuery(100, 50, 2000, 150, 500); // total = 2150
      monitor.recordQuery(100, 50, 2000, 150, 500); // total = 2150
      expect(monitor.getStats().avgQueryLatencyMs).toBe(2150);
    });
  });

  describe('recordIndex', () => {
    it('updates last index duration and cache hit rate', () => {
      monitor.recordIndex(10, 5000, 0.8);
      const stats = monitor.getStats();
      expect(stats.lastIndexDurationMs).toBe(5000);
      expect(stats.cacheHitRate).toBe(0.8);
    });

    it('updates indexedChunkCount', () => {
      monitor.recordIndex(42, 1000, 0);
      expect(monitor.getStats().indexedChunkCount).toBe(42);
    });
  });

  describe('maybeAutoTune', () => {
    it('does not tune if autoTuneEnabled is false', () => {
      const settings = { ...baseSettings, autoTuneEnabled: false };
      for (let i = 0; i < 10; i++) monitor.recordQuery(100, 50, 9000, 100, 200);
      const result = monitor.maybeAutoTune(settings);
      expect(result.topK).toBe(settings.topK);
    });

    it('does not tune before 10 queries', () => {
      for (let i = 0; i < 9; i++) monitor.recordQuery(100, 50, 9000, 100, 200);
      const result = monitor.maybeAutoTune(baseSettings);
      expect(result.topK).toBe(baseSettings.topK);
    });

    it('reduces topK when avg latency > 8000ms', () => {
      // avg latency = 9150ms (100+50+9000)
      for (let i = 0; i < 10; i++) monitor.recordQuery(100, 50, 9000, 100, 200);
      const result = monitor.maybeAutoTune(baseSettings);
      expect(result.topK).toBe(4); // 5 - 1
    });

    it('does not reduce topK below minimum of 3', () => {
      const settings = { ...baseSettings, topK: 3 };
      for (let i = 0; i < 10; i++) monitor.recordQuery(100, 50, 9000, 100, 200);
      const result = monitor.maybeAutoTune(settings);
      expect(result.topK).toBe(3);
    });

    it('increases topK when avg latency < 2000ms', () => {
      // avg latency = 1150ms (100+50+1000)
      for (let i = 0; i < 10; i++) monitor.recordQuery(100, 50, 1000, 100, 200);
      const result = monitor.maybeAutoTune(baseSettings);
      expect(result.topK).toBe(6); // 5 + 1
    });

    it('does not increase topK above maximum of 10', () => {
      const settings = { ...baseSettings, topK: 10 };
      for (let i = 0; i < 10; i++) monitor.recordQuery(100, 50, 1000, 100, 200);
      const result = monitor.maybeAutoTune(settings);
      expect(result.topK).toBe(10);
    });

    it('reduces chunkSize when token usage is consistently high', () => {
      // tokens = 3994, maxContextTokens = 4096 → 3994/4096 = 0.975 ≥ 0.95
      for (let i = 0; i < 10; i++) monitor.recordQuery(100, 50, 4000, 3994, 4096);
      const result = monitor.maybeAutoTune(baseSettings);
      expect(result.chunkSize).toBe(450); // 500 - 50
    });

    it('does not reduce chunkSize below minimum of 200', () => {
      const settings = { ...baseSettings, chunkSize: 200 };
      for (let i = 0; i < 10; i++) monitor.recordQuery(100, 50, 4000, 3994, 4096);
      const result = monitor.maybeAutoTune(settings);
      expect(result.chunkSize).toBe(200);
    });

    it('resets query buffer after tuning', () => {
      for (let i = 0; i < 10; i++) monitor.recordQuery(100, 50, 9000, 100, 200);
      monitor.maybeAutoTune(baseSettings);
      // After reset, 9 more high-latency queries should not trigger another tune
      for (let i = 0; i < 9; i++) monitor.recordQuery(100, 50, 9000, 100, 200);
      const result = monitor.maybeAutoTune({ ...baseSettings, topK: 4 });
      expect(result.topK).toBe(4); // unchanged — not yet at 10 queries
    });
  });
});
