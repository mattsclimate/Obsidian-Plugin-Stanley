import { describe, it, expect, beforeEach } from 'vitest';
import { VectorStore } from '../src/services/VectorStore';
import type { EmbeddedChunk } from '../src/types';

function makeChunk(filePath: string, content: string, embedding: number[]): EmbeddedChunk {
  return { filePath, content, charOffset: 0, embedding };
}

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore();
  });

  it('starts empty', () => {
    expect(store.size).toBe(0);
  });

  it('inserts chunks and reports correct size', () => {
    store.insert([
      makeChunk('a.md', 'hello', [1, 0]),
      makeChunk('b.md', 'world', [0, 1]),
    ]);
    expect(store.size).toBe(2);
  });

  it('removeByFile removes only chunks for that file', () => {
    store.insert([
      makeChunk('a.md', 'hello', [1, 0]),
      makeChunk('a.md', 'hello2', [1, 0.1]),
      makeChunk('b.md', 'world', [0, 1]),
    ]);
    store.removeByFile('a.md');
    expect(store.size).toBe(1);
  });

  it('clear empties the store', () => {
    store.insert([makeChunk('a.md', 'hello', [1, 0])]);
    store.clear();
    expect(store.size).toBe(0);
  });

  it('search returns top-K most similar chunks', () => {
    // [1,0] is most similar to [1,0], then [0.7,0.7], then [0,1]
    store.insert([
      makeChunk('a.md', 'exact match', [1, 0]),
      makeChunk('b.md', 'diagonal', [0.707, 0.707]),
      makeChunk('c.md', 'orthogonal', [0, 1]),
    ]);
    const results = store.search([1, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.content).toBe('exact match');
    expect(results[1]!.content).toBe('diagonal');
  });

  it('search returns fewer than topK if store has fewer chunks', () => {
    store.insert([makeChunk('a.md', 'only one', [1, 0])]);
    const results = store.search([1, 0], 5);
    expect(results).toHaveLength(1);
  });

  it('cosine similarity handles zero vectors without crashing', () => {
    store.insert([makeChunk('a.md', 'zero', [0, 0])]);
    expect(() => store.search([1, 0], 1)).not.toThrow();
  });
});
