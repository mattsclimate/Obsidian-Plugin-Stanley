# Stanley Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a privacy-first RAG-powered chat plugin for Obsidian that indexes vault notes via local Ollama embeddings and provides a streaming chat interface in the right sidebar.

**Architecture:** Layered service architecture — `OllamaClient`, `EmbeddingService`, `VectorStore`, `IndexManager`, `RAGEngine`, and `PerformanceMonitor` are independent services wired together in `main.ts`. `ChatView` is the sole UI component, registered as an Obsidian `ItemView` in the right sidebar. Services are injected via constructor to keep each unit testable in isolation.

**Tech Stack:** TypeScript, Obsidian Plugin API (≥0.15.0), Ollama REST API (local, no external calls), Vitest + jsdom for unit testing, esbuild for bundling (no config changes needed).

**Spec:** `docs/superpowers/specs/2026-04-13-stanley-plugin-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | Create | Shared interfaces: `Chunk`, `EmbeddedChunk`, `ChatMessage`, `PerformanceStats` |
| `src/settings.ts` | Modify | Full `StanleySettings` interface, defaults, settings tab UI |
| `src/services/OllamaClient.ts` | Create | HTTP wrapper for Ollama REST API (embed, chat, health check) |
| `src/services/VectorStore.ts` | Create | In-memory flat array with cosine similarity search |
| `src/services/EmbeddingService.ts` | Create | Chunking logic + calls OllamaClient for embeddings |
| `src/services/PerformanceMonitor.ts` | Create | Latency/token tracking, auto-tune logic |
| `src/services/IndexManager.ts` | Create | First-run, incremental, and on-open indexing orchestration |
| `src/services/RAGEngine.ts` | Create | Query → embed → retrieve → prompt → stream pipeline |
| `src/views/ChatView.ts` | Create | Obsidian ItemView: sidebar panel, streaming chat, stats |
| `src/main.ts` | Modify | Plugin entry point, wires all services, registers commands/views |
| `src/__mocks__/obsidian.ts` | Create | Vitest mock for Obsidian SDK (used in all tests) |
| `tests/OllamaClient.test.ts` | Create | Unit tests: embed, chat streaming, health check |
| `tests/VectorStore.test.ts` | Create | Unit tests: insert, removeByFile, search, cosine similarity |
| `tests/EmbeddingService.test.ts` | Create | Unit tests: chunking by size/overlap, title prepend, skip empty |
| `tests/PerformanceMonitor.test.ts` | Create | Unit tests: recordQuery, getStats, maybeAutoTune conditions |
| `tests/IndexManager.test.ts` | Create | Unit tests: first-run, incremental diff, on-open re-index |
| `tests/RAGEngine.test.ts` | Create | Unit tests: full query pipeline with mocked deps |
| `vitest.config.ts` | Create | Vitest config with jsdom, obsidian alias, path alias |
| `manifest.json` | Modify | Update author, description, authorUrl |
| `CLAUDE.md` | Create | Project overview, build/test commands, architecture notes |

---

## Task 1: Test Infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `src/__mocks__/obsidian.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest and jsdom**

```bash
npm install -D vitest @vitest/coverage-v8 jsdom
```

Expected: packages added to `devDependencies`, no errors.

- [ ] **Step 2: Add test script to `package.json`**

Open `package.json`. Replace the `"scripts"` block:

```json
"scripts": {
  "dev": "node esbuild.config.mjs",
  "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
  "version": "node version-bump.mjs && git add manifest.json versions.json",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    alias: {
      obsidian: resolve(__dirname, 'src/__mocks__/obsidian.ts'),
    },
  },
  resolve: {
    alias: {
      obsidian: resolve(__dirname, 'src/__mocks__/obsidian.ts'),
    },
  },
});
```

- [ ] **Step 4: Create `src/__mocks__/obsidian.ts`**

```typescript
export class Plugin {
  app: any;
  manifest: any;
  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }
  async loadData(): Promise<any> { return {}; }
  async saveData(_data: any): Promise<void> {}
  addRibbonIcon(_icon: string, _title: string, _cb: any): HTMLElement {
    return document.createElement('div');
  }
  addStatusBarItem(): HTMLElement { return document.createElement('div'); }
  addCommand(_cmd: any): void {}
  addSettingTab(_tab: any): void {}
  registerDomEvent(_el: any, _event: string, _cb: any): void {}
  registerInterval(_id: any): void {}
  registerEvent(_e: any): void {}
}

export class ItemView {
  app: any;
  containerEl: HTMLElement;
  leaf: any;
  constructor(leaf: any) {
    this.leaf = leaf;
    this.containerEl = document.createElement('div');
    this.app = leaf?.app ?? {};
  }
  getViewType(): string { return ''; }
  getDisplayText(): string { return ''; }
  getIcon(): string { return ''; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
  registerEvent(_e: any): void {}
}

export class Notice {
  constructor(_message: string, _duration?: number) {}
}

export class Modal {
  app: any;
  contentEl: HTMLElement;
  constructor(app: any) {
    this.app = app;
    this.contentEl = document.createElement('div');
  }
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: HTMLElement;
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }
  display(): void {}
  hide(): void {}
}

export class Setting {
  settingEl: HTMLElement;
  constructor(_containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
  }
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addText(cb: (text: any) => any): this {
    cb({
      setPlaceholder: () => ({ setValue: () => ({ onChange: (_fn: any) => ({}) }) }),
      setValue: (_v: string) => ({ onChange: (_fn: any) => ({}) }),
      onChange: (_fn: any) => ({}),
      inputEl: document.createElement('input'),
    });
    return this;
  }
  addToggle(cb: (toggle: any) => any): this {
    cb({ setValue: () => ({ onChange: (_fn: any) => ({}) }), onChange: (_fn: any) => ({}) });
    return this;
  }
  addSlider(cb: (slider: any) => any): this {
    cb({
      setLimits: () => ({ setStep: () => ({ setValue: () => ({ onChange: (_fn: any) => ({}) }) }) }),
      setValue: () => ({ onChange: (_fn: any) => ({}) }),
      onChange: (_fn: any) => ({}),
      setDynamicTooltip: () => ({}),
    });
    return this;
  }
  addButton(cb: (btn: any) => any): this {
    cb({ setButtonText: () => ({ onClick: (_fn: any) => ({}) }), onClick: (_fn: any) => ({}) });
    return this;
  }
}

export class MarkdownRenderer {
  static async renderMarkdown(
    markdown: string,
    el: HTMLElement,
    _sourcePath: string,
    _component: any
  ): Promise<void> {
    el.innerHTML = markdown;
  }
}

export class TAbstractFile {
  path: string;
  name: string;
  parent: any;
  vault: any;
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() ?? path;
    this.parent = null;
    this.vault = null;
  }
}

export class TFile extends TAbstractFile {
  basename: string;
  extension: string;
  stat: { mtime: number; ctime: number; size: number };

  constructor(path: string, mtime = Date.now()) {
    super(path);
    this.extension = this.name.includes('.') ? this.name.split('.').pop() ?? '' : '';
    this.basename = this.name.replace(`.${this.extension}`, '');
    this.stat = { mtime, ctime: mtime, size: 100 };
  }
}

export class WorkspaceLeaf {
  view: any;
  app: any;
  constructor(app?: any) { this.app = app ?? {}; }
  getViewState(): any { return {}; }
  setViewState(_state: any): Promise<void> { return Promise.resolve(); }
}

export class Vault {
  on(_event: string, _cb: any): any { return {}; }
  getMarkdownFiles(): TFile[] { return []; }
  read(_file: TFile): Promise<string> { return Promise.resolve(''); }
  create(_path: string, _content: string): Promise<TFile> {
    return Promise.resolve(new TFile(_path));
  }
  modify(_file: TFile, _content: string): Promise<void> { return Promise.resolve(); }
}

export class Workspace {
  on(_event: string, _cb: any): any { return {}; }
  getActiveViewOfType<T>(_type: any): T | null { return null; }
  getRightLeaf(_creating: boolean): WorkspaceLeaf { return new WorkspaceLeaf(); }
  revealLeaf(_leaf: WorkspaceLeaf): void {}
  getLeavesOfType(_type: string): WorkspaceLeaf[] { return []; }
}

export class App {
  vault: Vault = new Vault();
  workspace: Workspace = new Workspace();
  metadataCache: any = {};
}

export function addIcon(_id: string, _svg: string): void {}
```

- [ ] **Step 5: Verify test infrastructure runs**

```bash
cd [PLUGIN_ROOT] && npm test 2>&1 | head -20
```

Expected: Vitest runs and reports "No test files found" (no tests yet, but no config errors).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/__mocks__/obsidian.ts package.json package-lock.json
git commit -m "feat: add vitest test infrastructure and obsidian mock"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types (Chunk, EmbeddedChunk, ChatMessage, PerformanceStats)"
```

---

## Task 3: OllamaClient

**Files:**
- Create: `src/services/OllamaClient.ts`
- Create: `tests/OllamaClient.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/OllamaClient.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaClient } from '../src/services/OllamaClient';

describe('OllamaClient', () => {
  let client: OllamaClient;

  beforeEach(() => {
    client = new OllamaClient('http://localhost:11434', 'nomic-embed-text', 'llama3');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkHealth', () => {
    it('returns true when Ollama is reachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const result = await client.checkHealth();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags');
    });

    it('returns false when Ollama is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const result = await client.checkHealth();
      expect(result).toBe(false);
    });

    it('returns false when response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const result = await client.checkHealth();
      expect(result).toBe(false);
    });
  });

  describe('embed', () => {
    it('returns an embedding vector', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: mockEmbedding }),
      }));
      const result = await client.embed('hello world');
      expect(result).toEqual(mockEmbedding);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ model: 'nomic-embed-text', prompt: 'hello world' }),
        })
      );
    });

    it('throws when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await expect(client.embed('test')).rejects.toThrow('Ollama embed failed: 500');
    });
  });

  describe('chat', () => {
    it('streams tokens and returns full response with token count', async () => {
      const chunks = [
        '{"message":{"role":"assistant","content":"Hello"},"done":false}\n',
        '{"message":{"role":"assistant","content":" world"},"done":false}\n',
        '{"message":{"role":"assistant","content":""},"done":true,"eval_count":5}\n',
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            return {
              done: false,
              value: new TextEncoder().encode(chunks[chunkIndex++]),
            };
          }
          return { done: true, value: undefined };
        }),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      }));

      const tokens: string[] = [];
      const result = await client.chat(
        [{ role: 'user', content: 'hi', timestamp: 0 }],
        (t) => tokens.push(t)
      );

      expect(tokens).toEqual(['Hello', ' world']);
      expect(result.response).toBe('Hello world');
      expect(result.tokenCount).toBe(5);
    });

    it('throws when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
      await expect(
        client.chat([{ role: 'user', content: 'hi', timestamp: 0 }], () => {})
      ).rejects.toThrow('Ollama chat failed: 503');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/OllamaClient.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/services/OllamaClient'`

- [ ] **Step 3: Create `src/services/OllamaClient.ts`**

```typescript
import type { ChatMessage } from '../types';

export class OllamaClient {
  constructor(
    private baseUrl: string,
    private embeddingModel: string,
    private chatModel: string
  ) {}

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, prompt: text }),
    });
    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
    const data = await res.json() as { embedding: number[] };
    return data.embedding;
  }

  async chat(
    messages: ChatMessage[],
    onToken: (token: string) => void
  ): Promise<{ response: string; tokenCount: number }> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.chatModel,
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: true,
      }),
    });
    if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`);
    if (!res.body) throw new Error('No response body from Ollama');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let tokenCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content: string };
            done: boolean;
            eval_count?: number;
          };
          if (parsed.message?.content) {
            fullResponse += parsed.message.content;
            onToken(parsed.message.content);
          }
          if (parsed.done && parsed.eval_count) {
            tokenCount = parsed.eval_count;
          }
        } catch { /* skip malformed lines */ }
      }
    }

    return { response: fullResponse, tokenCount };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/OllamaClient.test.ts 2>&1 | tail -15
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/OllamaClient.ts tests/OllamaClient.test.ts
git commit -m "feat: add OllamaClient (embed, chat streaming, health check)"
```

---

## Task 4: VectorStore

**Files:**
- Create: `src/services/VectorStore.ts`
- Create: `tests/VectorStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/VectorStore.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/VectorStore.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/services/VectorStore'`

- [ ] **Step 3: Create `src/services/VectorStore.ts`**

```typescript
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
    this.chunks.push(...chunks);
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/VectorStore.test.ts 2>&1 | tail -15
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/VectorStore.ts tests/VectorStore.test.ts
git commit -m "feat: add VectorStore with cosine similarity search"
```

---

## Task 5: EmbeddingService

**Files:**
- Create: `src/services/EmbeddingService.ts`
- Create: `tests/EmbeddingService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/EmbeddingService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from '../src/services/EmbeddingService';
import { TFile } from 'obsidian';
import type { StanleySettings } from '../src/settings';
import type { OllamaClient } from '../src/services/OllamaClient';

const defaultSettings: StanleySettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text',
  chatModel: 'llama3',
  chunkSize: 100,
  chunkOverlap: 20,
  topK: 5,
  maxContextTokens: 4096,
  autoTuneEnabled: true,
  fileModTimes: {},
};

function makeMockClient(): OllamaClient {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    chat: vi.fn(),
    checkHealth: vi.fn(),
  } as unknown as OllamaClient;
}

describe('EmbeddingService', () => {
  let mockClient: OllamaClient;
  let service: EmbeddingService;

  beforeEach(() => {
    mockClient = makeMockClient();
    service = new EmbeddingService(mockClient);
  });

  describe('chunkNote', () => {
    it('prepends note title to each chunk', () => {
      const file = new TFile('folder/My Note.md');
      const content = 'First paragraph.\n\nSecond paragraph.';
      const chunks = service.chunkNote(file, content, defaultSettings);
      expect(chunks.every((c) => c.content.startsWith('My Note\n'))).toBe(true);
    });

    it('returns empty array for empty content', () => {
      const file = new TFile('a.md');
      const chunks = service.chunkNote(file, '', defaultSettings);
      expect(chunks).toHaveLength(0);
    });

    it('returns empty array for whitespace-only content', () => {
      const file = new TFile('a.md');
      const chunks = service.chunkNote(file, '   \n\n  ', defaultSettings);
      expect(chunks).toHaveLength(0);
    });

    it('splits content into multiple chunks when content exceeds chunkSize', () => {
      const file = new TFile('a.md');
      // 5 paragraphs of 30 chars each, chunkSize=100 so ~3 paragraphs fit per chunk
      const content = Array(5).fill('A'.repeat(28)).join('\n\n');
      const chunks = service.chunkNote(file, content, defaultSettings);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('sets filePath from the TFile path', () => {
      const file = new TFile('vault/notes/test.md');
      const chunks = service.chunkNote(file, 'Some content here.', defaultSettings);
      expect(chunks.every((c) => c.filePath === 'vault/notes/test.md')).toBe(true);
    });

    it('uses basename without extension for title', () => {
      const file = new TFile('My Document.md');
      const chunks = service.chunkNote(file, 'Content here.', defaultSettings);
      expect(chunks[0]?.content).toMatch(/^My Document\n/);
    });
  });

  describe('embedChunks', () => {
    it('calls embed for each chunk and returns EmbeddedChunks', async () => {
      const file = new TFile('a.md');
      const chunks = service.chunkNote(file, 'Content.', defaultSettings);
      const embedded = await service.embedChunks(chunks);
      expect(embedded).toHaveLength(chunks.length);
      expect(embedded[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(mockClient.embed).toHaveBeenCalledTimes(chunks.length);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/EmbeddingService.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/services/EmbeddingService'`

- [ ] **Step 3: Create `src/services/EmbeddingService.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/EmbeddingService.test.ts 2>&1 | tail -15
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/EmbeddingService.ts tests/EmbeddingService.test.ts
git commit -m "feat: add EmbeddingService (paragraph chunking with overlap, title prepend)"
```

---

## Task 6: PerformanceMonitor

**Files:**
- Create: `src/services/PerformanceMonitor.ts`
- Create: `tests/PerformanceMonitor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/PerformanceMonitor.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/PerformanceMonitor.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/services/PerformanceMonitor'`

- [ ] **Step 3: Create `src/services/PerformanceMonitor.ts`**

```typescript
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
    this.queryBuffer = []; // reset after tuning

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/PerformanceMonitor.test.ts 2>&1 | tail -15
```

Expected: All 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/PerformanceMonitor.ts tests/PerformanceMonitor.test.ts
git commit -m "feat: add PerformanceMonitor with auto-tuning for topK and chunkSize"
```

---

## Task 7: Settings

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Replace `src/settings.ts` with full Stanley settings**

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';
import type StanleyPlugin from './main';

export interface StanleySettings {
  ollamaBaseUrl: string;
  embeddingModel: string;
  chatModel: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  maxContextTokens: number;
  autoTuneEnabled: boolean;
  fileModTimes: Record<string, number>;
}

export const DEFAULT_Stanley_SETTINGS: StanleySettings = {
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

export class StanleySettingTab extends PluginSettingTab {
  plugin: StanleyPlugin;

  constructor(app: App, plugin: StanleyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Stanley Settings' });

    new Setting(containerEl)
      .setName('Ollama URL')
      .setDesc('Base URL of your local Ollama instance')
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.ollamaBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaBaseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Embedding model')
      .setDesc('Ollama model used for generating embeddings (e.g. nomic-embed-text)')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.embeddingModel)
          .onChange(async (value) => {
            this.plugin.settings.embeddingModel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Chat model')
      .setDesc('Ollama model used for chat responses (e.g. llama3)')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.chatModel)
          .onChange(async (value) => {
            this.plugin.settings.chatModel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Chunk size')
      .setDesc(`Characters per chunk (auto-tuned: ${this.plugin.settings.chunkSize})`)
      .addSlider((slider) =>
        slider
          .setLimits(200, 1000, 50)
          .setValue(this.plugin.settings.chunkSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.chunkSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Chunk overlap')
      .setDesc(`Character overlap between chunks (auto-tuned: ${this.plugin.settings.chunkOverlap})`)
      .addSlider((slider) =>
        slider
          .setLimits(0, 150, 10)
          .setValue(this.plugin.settings.chunkOverlap)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.chunkOverlap = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Top-K retrieval')
      .setDesc(`Number of chunks to retrieve per query (auto-tuned: ${this.plugin.settings.topK})`)
      .addSlider((slider) =>
        slider
          .setLimits(3, 10, 1)
          .setValue(this.plugin.settings.topK)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.topK = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Max context tokens')
      .setDesc('Maximum tokens to include in each chat prompt')
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxContextTokens))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxContextTokens = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Auto-tune')
      .setDesc('Automatically adjust chunk size and top-K based on observed performance')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoTuneEnabled).onChange(async (value) => {
          this.plugin.settings.autoTuneEnabled = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly (settings only)**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep settings
```

Expected: No errors related to settings.ts.

- [ ] **Step 3: Commit**

```bash
git add src/settings.ts
git commit -m "feat: replace placeholder settings with full Stanley settings interface and tab UI"
```

---

## Task 8: IndexManager

**Files:**
- Create: `src/services/IndexManager.ts`
- Create: `tests/IndexManager.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/IndexManager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexManager } from '../src/services/IndexManager';
import { TFile, Vault, App } from 'obsidian';
import type { VectorStore } from '../src/services/VectorStore';
import type { EmbeddingService } from '../src/services/EmbeddingService';
import type { PerformanceMonitor } from '../src/services/PerformanceMonitor';
import type StanleyPlugin from '../src/main';

function makePlugin(fileModTimes: Record<string, number> = {}): StanleyPlugin {
  return {
    settings: {
      ollamaBaseUrl: 'http://localhost:11434',
      embeddingModel: 'nomic-embed-text',
      chatModel: 'llama3',
      chunkSize: 500,
      chunkOverlap: 50,
      topK: 5,
      maxContextTokens: 4096,
      autoTuneEnabled: true,
      fileModTimes,
    },
    saveSettings: vi.fn().mockResolvedValue(undefined),
  } as unknown as StanleyPlugin;
}

function makeFile(path: string, mtime: number): TFile {
  const f = new TFile(path, mtime);
  return f;
}

describe('IndexManager', () => {
  let mockStore: VectorStore;
  let mockEmbeddingService: EmbeddingService;
  let mockMonitor: PerformanceMonitor;
  let mockApp: App;

  beforeEach(() => {
    mockStore = {
      insert: vi.fn(),
      removeByFile: vi.fn(),
      clear: vi.fn(),
      search: vi.fn(),
      size: 0,
    } as unknown as VectorStore;

    mockEmbeddingService = {
      chunkNote: vi.fn().mockReturnValue([{ filePath: 'a.md', content: 'chunk', charOffset: 0 }]),
      embedChunks: vi.fn().mockResolvedValue([
        { filePath: 'a.md', content: 'chunk', charOffset: 0, embedding: [0.1] },
      ]),
    } as unknown as EmbeddingService;

    mockMonitor = {
      recordIndex: vi.fn(),
    } as unknown as PerformanceMonitor;

    mockApp = new App();
    vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([]);
    vi.spyOn(mockApp.vault, 'read').mockResolvedValue('note content');
    vi.spyOn(mockApp.vault, 'on').mockReturnValue({} as any);
    vi.spyOn(mockApp.workspace, 'on').mockReturnValue({} as any);
  });

  describe('initialize - first run', () => {
    it('indexes all markdown files when fileModTimes is empty', async () => {
      const file1 = makeFile('a.md', 1000);
      const file2 = makeFile('b.md', 2000);
      vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([file1, file2]);

      const plugin = makePlugin({});
      const manager = new IndexManager(mockApp, mockStore, mockEmbeddingService, mockMonitor, plugin);
      await manager.initialize();

      expect(mockEmbeddingService.embedChunks).toHaveBeenCalledTimes(2);
      expect(mockStore.insert).toHaveBeenCalledTimes(2);
      expect(plugin.settings.fileModTimes['a.md']).toBe(1000);
      expect(plugin.settings.fileModTimes['b.md']).toBe(2000);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('initialize - incremental', () => {
    it('skips unchanged files', async () => {
      const file1 = makeFile('a.md', 1000);
      const file2 = makeFile('b.md', 2000);
      vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([file1, file2]);

      // Both files already indexed at current mtime
      const plugin = makePlugin({ 'a.md': 1000, 'b.md': 2000 });
      const manager = new IndexManager(mockApp, mockStore, mockEmbeddingService, mockMonitor, plugin);
      await manager.initialize();

      expect(mockEmbeddingService.embedChunks).not.toHaveBeenCalled();
    });

    it('re-indexes only modified files', async () => {
      const file1 = makeFile('a.md', 1000);
      const file2 = makeFile('b.md', 3000); // mtime changed from 2000 to 3000
      vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([file1, file2]);

      const plugin = makePlugin({ 'a.md': 1000, 'b.md': 2000 });
      const manager = new IndexManager(mockApp, mockStore, mockEmbeddingService, mockMonitor, plugin);
      await manager.initialize();

      expect(mockEmbeddingService.embedChunks).toHaveBeenCalledTimes(1);
      expect(mockStore.removeByFile).toHaveBeenCalledWith('b.md');
      expect(plugin.settings.fileModTimes['b.md']).toBe(3000);
    });

    it('records cache hit rate with monitor', async () => {
      const file1 = makeFile('a.md', 1000);
      const file2 = makeFile('b.md', 2000);
      vi.spyOn(mockApp.vault, 'getMarkdownFiles').mockReturnValue([file1, file2]);

      // Only b.md is new
      const plugin = makePlugin({ 'a.md': 1000 });
      const manager = new IndexManager(mockApp, mockStore, mockEmbeddingService, mockMonitor, plugin);
      await manager.initialize();

      expect(mockMonitor.recordIndex).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        0.5 // 1 skipped out of 2 total
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/IndexManager.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/services/IndexManager'`

- [ ] **Step 3: Create `src/services/IndexManager.ts`**

```typescript
import { TFile } from 'obsidian';
import type { App, TAbstractFile } from 'obsidian';
import type { VectorStore } from './VectorStore';
import type { EmbeddingService } from './EmbeddingService';
import type { PerformanceMonitor } from './PerformanceMonitor';
import type StanleyPlugin from '../main';

const BATCH_SIZE = 10;

export class IndexManager {
  constructor(
    private app: App,
    private store: VectorStore,
    private embeddingService: EmbeddingService,
    private monitor: PerformanceMonitor,
    private plugin: StanleyPlugin
  ) {}

  async initialize(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    const isFirstRun = Object.keys(this.plugin.settings.fileModTimes).length === 0;

    const toIndex: TFile[] = [];
    let skipped = 0;

    for (const file of files) {
      const storedMtime = this.plugin.settings.fileModTimes[file.path];
      if (!isFirstRun && storedMtime === file.stat.mtime) {
        skipped++;
      } else {
        toIndex.push(file);
      }
    }

    const startMs = Date.now();
    await this.indexFiles(toIndex);
    const durationMs = Date.now() - startMs;

    const cacheHitRate = files.length > 0 ? skipped / files.length : 0;
    const totalChunks = this.store.size;
    this.monitor.recordIndex(totalChunks, durationMs, cacheHitRate);

    this.registerEventListeners();
  }

  async reindexAll(): Promise<void> {
    this.store.clear();
    this.plugin.settings.fileModTimes = {};
    await this.plugin.saveSettings();
    await this.initialize();
  }

  private async indexFiles(files: TFile[]): Promise<void> {
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((file) => this.indexFile(file)));
    }
    if (files.length > 0) {
      await this.plugin.saveSettings();
    }
  }

  private async indexFile(file: TFile): Promise<void> {
    this.store.removeByFile(file.path);
    const content = await this.app.vault.read(file);
    const chunks = this.embeddingService.chunkNote(file, content, this.plugin.settings);
    if (chunks.length === 0) return;
    const embedded = await this.embeddingService.embedChunks(chunks);
    this.store.insert(embedded);
    this.plugin.settings.fileModTimes[file.path] = file.stat.mtime;
  }

  private registerEventListeners(): void {
    this.plugin.registerEvent(
      this.app.vault.on('modify', (abstract: TAbstractFile) => {
        if (abstract instanceof TFile) void this.indexFile(abstract);
      })
    );
    this.plugin.registerEvent(
      this.app.workspace.on('file-open', (file: TFile | null) => {
        if (file) void this.indexFile(file);
      })
    );
    this.plugin.registerEvent(
      this.app.vault.on('delete', (abstract: TAbstractFile) => {
        if (abstract instanceof TFile) {
          this.store.removeByFile(abstract.path);
          delete this.plugin.settings.fileModTimes[abstract.path];
        }
      })
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/IndexManager.test.ts 2>&1 | tail -15
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/IndexManager.ts tests/IndexManager.test.ts
git commit -m "feat: add IndexManager (first-run, incremental, on-open indexing)"
```

---

## Task 9: RAGEngine

**Files:**
- Create: `src/services/RAGEngine.ts`
- Create: `tests/RAGEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/RAGEngine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGEngine } from '../src/services/RAGEngine';
import type { OllamaClient } from '../src/services/OllamaClient';
import type { VectorStore } from '../src/services/VectorStore';
import type { PerformanceMonitor } from '../src/services/PerformanceMonitor';
import type { StanleySettings } from '../src/settings';
import type { EmbeddedChunk } from '../src/types';

const settings: StanleySettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text',
  chatModel: 'llama3',
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 3,
  maxContextTokens: 4096,
  autoTuneEnabled: false,
  fileModTimes: {},
};

function makeChunk(filePath: string, content: string): EmbeddedChunk {
  return { filePath, content, charOffset: 0, embedding: [0.1] };
}

describe('RAGEngine', () => {
  let mockClient: OllamaClient;
  let mockStore: VectorStore;
  let mockMonitor: PerformanceMonitor;
  let engine: RAGEngine;

  beforeEach(() => {
    mockClient = {
      embed: vi.fn().mockResolvedValue([0.5, 0.5]),
      chat: vi.fn().mockResolvedValue({ response: 'Test answer', tokenCount: 42 }),
    } as unknown as OllamaClient;

    mockStore = {
      search: vi.fn().mockReturnValue([
        makeChunk('note-a.md', 'Context from note A'),
        makeChunk('note-b.md', 'Context from note B'),
      ]),
    } as unknown as VectorStore;

    mockMonitor = {
      recordQuery: vi.fn(),
      maybeAutoTune: vi.fn().mockImplementation((s) => s),
    } as unknown as PerformanceMonitor;

    engine = new RAGEngine(mockClient, mockStore, mockMonitor);
  });

  it('embeds the user query', async () => {
    await engine.query('What is X?', settings, () => {});
    expect(mockClient.embed).toHaveBeenCalledWith('What is X?');
  });

  it('searches the vector store with query embedding and topK', async () => {
    await engine.query('What is X?', settings, () => {});
    expect(mockStore.search).toHaveBeenCalledWith([0.5, 0.5], settings.topK);
  });

  it('passes wikilink citations in the chat messages', async () => {
    await engine.query('What is X?', settings, () => {});
    const chatCall = vi.mocked(mockClient.chat).mock.calls[0];
    const messages = chatCall?.[0];
    const systemMessage = messages?.find((m) => m.role === 'user');
    expect(systemMessage?.content).toContain('[[note-a]]');
    expect(systemMessage?.content).toContain('[[note-b]]');
  });

  it('passes the user query in the chat messages', async () => {
    await engine.query('What is X?', settings, () => {});
    const chatCall = vi.mocked(mockClient.chat).mock.calls[0];
    const messages = chatCall?.[0];
    const lastMessage = messages?.[messages.length - 1];
    expect(lastMessage?.content).toContain('What is X?');
  });

  it('returns the full response from OllamaClient.chat', async () => {
    const result = await engine.query('What is X?', settings, () => {});
    expect(result.response).toBe('Test answer');
  });

  it('calls recordQuery on the monitor', async () => {
    await engine.query('What is X?', settings, () => {});
    expect(mockMonitor.recordQuery).toHaveBeenCalled();
  });

  it('calls maybeAutoTune and returns potentially updated settings', async () => {
    const tunedSettings = { ...settings, topK: 4 };
    vi.mocked(mockMonitor.maybeAutoTune).mockReturnValue(tunedSettings);
    const result = await engine.query('What is X?', settings, () => {});
    expect(result.settings.topK).toBe(4);
  });

  it('streams tokens via the onToken callback', async () => {
    vi.mocked(mockClient.chat).mockImplementation(async (_msgs, onToken) => {
      onToken('Hello');
      onToken(' there');
      return { response: 'Hello there', tokenCount: 5 };
    });
    const tokens: string[] = [];
    await engine.query('hi', settings, (t) => tokens.push(t));
    expect(tokens).toEqual(['Hello', ' there']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/RAGEngine.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/services/RAGEngine'`

- [ ] **Step 3: Create `src/services/RAGEngine.ts`**

```typescript
import type { OllamaClient } from './OllamaClient';
import type { VectorStore } from './VectorStore';
import type { PerformanceMonitor } from './PerformanceMonitor';
import type { StanleySettings } from '../settings';
import type { ChatMessage } from '../types';

export class RAGEngine {
  constructor(
    private client: OllamaClient,
    private store: VectorStore,
    private monitor: PerformanceMonitor
  ) {}

  async query(
    userQuery: string,
    settings: StanleySettings,
    onToken: (token: string) => void
  ): Promise<{ response: string; settings: StanleySettings }> {
    const t0 = Date.now();

    const queryEmbedding = await this.client.embed(userQuery);
    const t1 = Date.now();

    const chunks = this.store.search(queryEmbedding, settings.topK);
    const t2 = Date.now();

    const context = chunks
      .map((c) => {
        const noteName = c.filePath.replace(/\.md$/, '').split('/').pop() ?? c.filePath;
        return `[[${noteName}]]\n${c.content}`;
      })
      .join('\n\n---\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          'You are a knowledge assistant for a personal Obsidian vault.',
          'Answer the question using only the context provided below.',
          'If the answer is not in the context, say "I couldn\'t find that in your vault."',
          'Cite the source notes using [[wikilink]] format.',
          '',
          'Context:',
          context,
          '',
          `Question: ${userQuery}`,
        ].join('\n'),
        timestamp: Date.now(),
      },
    ];

    const { response, tokenCount } = await this.client.chat(messages, onToken);
    const t3 = Date.now();

    this.monitor.recordQuery(t1 - t0, t2 - t1, t3 - t2, tokenCount, settings.maxContextTokens);
    const updatedSettings = this.monitor.maybeAutoTune(settings);

    return { response, settings: updatedSettings };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/RAGEngine.test.ts 2>&1 | tail -15
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/RAGEngine.ts tests/RAGEngine.test.ts
git commit -m "feat: add RAGEngine (embed → retrieve → prompt → stream pipeline)"
```

---

## Task 10: ChatView

**Files:**
- Create: `src/views/ChatView.ts`

- [ ] **Step 1: Create `src/views/ChatView.ts`**

```typescript
import { ItemView, MarkdownRenderer, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import type StanleyPlugin from '../main';
import type { RAGEngine } from '../services/RAGEngine';
import type { IndexManager } from '../services/IndexManager';
import type { PerformanceMonitor } from '../services/PerformanceMonitor';
import type { ChatMessage } from '../types';

export const VIEW_TYPE_CHAT = 'stanley-chat-view';

export class ChatView extends ItemView {
  private plugin: StanleyPlugin;
  private ragEngine: RAGEngine;
  private indexManager: IndexManager;
  private monitor: PerformanceMonitor;

  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private insertBtn!: HTMLButtonElement;
  private newNoteBtn!: HTMLButtonElement;
  private actionsEl!: HTMLElement;
  private statusDot!: HTMLElement;
  private statsEl!: HTMLElement;

  private history: ChatMessage[] = [];
  private lastResponse = '';
  private lastQuery = '';

  constructor(
    leaf: WorkspaceLeaf,
    plugin: StanleyPlugin,
    ragEngine: RAGEngine,
    indexManager: IndexManager,
    monitor: PerformanceMonitor
  ) {
    super(leaf);
    this.plugin = plugin;
    this.ragEngine = ragEngine;
    this.indexManager = indexManager;
    this.monitor = monitor;
  }

  getViewType(): string { return VIEW_TYPE_CHAT; }
  getDisplayText(): string { return 'Stanley Chat'; }
  getIcon(): string { return 'message-circle'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('stanley-chat-root');

    this.renderHeader(root);
    this.messagesEl = root.createDiv({ cls: 'stanley-messages' });
    this.actionsEl = root.createDiv({ cls: 'stanley-actions' });
    this.actionsEl.hide();
    this.renderActions(this.actionsEl);
    this.renderInput(root);
    this.renderStats(root);

    await this.updateStatus();
  }

  async onClose(): Promise<void> {}

  private renderHeader(root: HTMLElement): void {
    const header = root.createDiv({ cls: 'stanley-header' });
    header.createEl('span', { text: 'Stanley', cls: 'stanley-title' });

    this.statusDot = header.createEl('span', { cls: 'stanley-status-dot stanley-status-unknown' });
    this.statusDot.title = 'Checking Ollama connection...';

    const settingsBtn = header.createEl('button', { text: '⚙', cls: 'stanley-icon-btn' });
    settingsBtn.title = 'Open Stanley settings';
    settingsBtn.addEventListener('click', () => {
      // @ts-ignore — Obsidian internal API
      this.app.setting?.open?.();
      // @ts-ignore
      this.app.setting?.openTabById?.('stanley-local-plugin');
    });
  }

  private renderActions(container: HTMLElement): void {
    this.insertBtn = container.createEl('button', { text: 'Insert', cls: 'stanley-btn' });
    this.insertBtn.title = 'Insert last response at cursor in active note';
    this.insertBtn.addEventListener('click', () => this.insertIntoNote());

    this.newNoteBtn = container.createEl('button', { text: 'New Note', cls: 'stanley-btn' });
    this.newNoteBtn.title = 'Create a new note from last response';
    this.newNoteBtn.addEventListener('click', () => void this.createNewNote());
  }

  private renderInput(root: HTMLElement): void {
    const inputRow = root.createDiv({ cls: 'stanley-input-row' });

    this.inputEl = inputRow.createEl('textarea', {
      cls: 'stanley-input',
      attr: { placeholder: 'Ask your vault...', rows: '2' },
    }) as HTMLTextAreaElement;

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSend();
      }
    });

    this.sendBtn = inputRow.createEl('button', { text: '↑', cls: 'stanley-send-btn' });
    this.sendBtn.addEventListener('click', () => void this.handleSend());
  }

  private renderStats(root: HTMLElement): void {
    const statsSection = root.createDiv({ cls: 'stanley-stats-section' });
    const toggle = statsSection.createEl('button', { text: '▶ Stats', cls: 'stanley-stats-toggle' });
    this.statsEl = statsSection.createDiv({ cls: 'stanley-stats-content' });
    this.statsEl.hide();

    toggle.addEventListener('click', () => {
      if (this.statsEl.isShown()) {
        this.statsEl.hide();
        toggle.textContent = '▶ Stats';
      } else {
        this.statsEl.show();
        toggle.textContent = '▼ Stats';
        this.refreshStats();
      }
    });

    const reindexBtn = statsSection.createEl('button', {
      text: 'Re-index vault',
      cls: 'stanley-btn stanley-reindex-btn',
    });
    reindexBtn.addEventListener('click', () => {
      new Notice('Stanley: Re-indexing vault...');
      void this.indexManager.reindexAll().then(() => {
        new Notice('Stanley: Re-index complete.');
        this.refreshStats();
      });
    });
  }

  private refreshStats(): void {
    const stats = this.monitor.getStats();
    this.statsEl.empty();
    const rows: [string, string][] = [
      ['Indexed chunks', String(stats.indexedChunkCount)],
      ['Last index', `${stats.lastIndexDurationMs}ms`],
      ['Avg query latency', `${Math.round(stats.avgQueryLatencyMs)}ms`],
      ['Total tokens used', String(stats.totalTokensUsed)],
      ['Cache hit rate', `${Math.round(stats.cacheHitRate * 100)}%`],
    ];
    for (const [label, value] of rows) {
      const row = this.statsEl.createDiv({ cls: 'stanley-stat-row' });
      row.createEl('span', { text: label, cls: 'stanley-stat-label' });
      row.createEl('span', { text: value, cls: 'stanley-stat-value' });
    }
  }

  private async updateStatus(): Promise<void> {
    const healthy = await this.plugin.ollamaClient.checkHealth();
    this.statusDot.removeClass('stanley-status-unknown', 'stanley-status-ok', 'stanley-status-error');
    if (healthy) {
      this.statusDot.addClass('stanley-status-ok');
      this.statusDot.title = 'Ollama connected';
      this.inputEl.disabled = false;
      this.sendBtn.disabled = false;
    } else {
      this.statusDot.addClass('stanley-status-error');
      this.statusDot.title = `Ollama unreachable at ${this.plugin.settings.ollamaBaseUrl}`;
      this.inputEl.disabled = true;
      this.sendBtn.disabled = true;
      this.appendMessage('assistant', `⚠ Ollama not reachable at \`${this.plugin.settings.ollamaBaseUrl}\`. Start Ollama and re-open this panel.`);
    }
  }

  private async handleSend(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query) return;

    this.lastQuery = query;
    this.inputEl.value = '';
    this.actionsEl.hide();
    this.sendBtn.disabled = true;
    this.inputEl.disabled = true;

    this.appendMessage('user', query);

    const streamingEl = this.appendStreamingBubble();
    let streamedText = '';

    try {
      const result = await this.ragEngine.query(
        query,
        this.plugin.settings,
        (token) => {
          streamedText += token;
          streamingEl.textContent = streamedText;
          this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: 'smooth' });
        }
      );

      // Replace streaming text with rendered markdown
      streamingEl.textContent = '';
      await MarkdownRenderer.renderMarkdown(
        result.response,
        streamingEl,
        '',
        this
      );

      this.lastResponse = result.response;
      this.history.push(
        { role: 'user', content: query, timestamp: Date.now() },
        { role: 'assistant', content: result.response, timestamp: Date.now() }
      );

      // Apply auto-tuned settings if changed
      if (result.settings !== this.plugin.settings) {
        this.plugin.settings = result.settings;
        await this.plugin.saveSettings();
      }

      this.actionsEl.show();
    } catch (err) {
      streamingEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.sendBtn.disabled = false;
      this.inputEl.disabled = false;
      this.inputEl.focus();
    }
  }

  private appendMessage(role: 'user' | 'assistant', content: string): void {
    const bubble = this.messagesEl.createDiv({ cls: `stanley-bubble stanley-bubble-${role}` });
    bubble.textContent = content;
    this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: 'smooth' });
  }

  private appendStreamingBubble(): HTMLElement {
    const bubble = this.messagesEl.createDiv({ cls: 'stanley-bubble stanley-bubble-assistant stanley-bubble-streaming' });
    this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: 'smooth' });
    return bubble;
  }

  private insertIntoNote(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice('Stanley: No active note to insert into.');
      return;
    }
    view.editor.replaceSelection(this.lastResponse);
  }

  private async createNewNote(): Promise<void> {
    const baseName = this.lastQuery.slice(0, 50).replace(/[/\\?%*:|"<>]/g, '-');
    const title = `Stanley - ${baseName}`;
    try {
      await this.app.vault.create(`${title}.md`, this.lastResponse);
      new Notice(`Stanley: Created note "${title}"`);
    } catch {
      new Notice(`Stanley: Could not create note "${title}" — it may already exist.`);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles (checking for type errors only)**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep -v node_modules | head -30
```

Expected: No errors in `src/views/ChatView.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/views/ChatView.ts
git commit -m "feat: add ChatView sidebar panel (streaming chat, insert, new note, stats)"
```

---

## Task 11: Main Plugin Entry Point

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace `src/main.ts`**

```typescript
import { Notice, Plugin } from 'obsidian';
import { DEFAULT_Stanley_SETTINGS, StanleySettingTab } from './settings';
import type { StanleySettings } from './settings';
import { OllamaClient } from './services/OllamaClient';
import { VectorStore } from './services/VectorStore';
import { EmbeddingService } from './services/EmbeddingService';
import { PerformanceMonitor } from './services/PerformanceMonitor';
import { IndexManager } from './services/IndexManager';
import { RAGEngine } from './services/RAGEngine';
import { ChatView, VIEW_TYPE_CHAT } from './views/ChatView';

export default class StanleyPlugin extends Plugin {
  settings!: StanleySettings;
  ollamaClient!: OllamaClient;

  private store!: VectorStore;
  private embeddingService!: EmbeddingService;
  private monitor!: PerformanceMonitor;
  private indexManager!: IndexManager;
  private ragEngine!: RAGEngine;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.ollamaClient = new OllamaClient(
      this.settings.ollamaBaseUrl,
      this.settings.embeddingModel,
      this.settings.chatModel
    );
    this.store = new VectorStore();
    this.embeddingService = new EmbeddingService(this.ollamaClient);
    this.monitor = new PerformanceMonitor();
    this.indexManager = new IndexManager(
      this.app,
      this.store,
      this.embeddingService,
      this.monitor,
      this
    );
    this.ragEngine = new RAGEngine(this.ollamaClient, this.store, this.monitor);

    this.registerView(VIEW_TYPE_CHAT, (leaf) =>
      new ChatView(leaf, this, this.ragEngine, this.indexManager, this.monitor)
    );

    this.addRibbonIcon('message-circle', 'Open Stanley Chat', () => {
      void this.activateChatView();
    });

    this.addCommand({
      id: 'open-chat',
      name: 'Open chat panel',
      callback: () => void this.activateChatView(),
    });

    this.addCommand({
      id: 'reindex-vault',
      name: 'Re-index entire vault',
      callback: () => {
        new Notice('Stanley: Re-indexing vault...');
        void this.indexManager.reindexAll().then(() =>
          new Notice('Stanley: Re-index complete.')
        );
      },
    });

    this.addSettingTab(new StanleySettingTab(this.app, this));

    // Check Ollama health, then start indexing
    const healthy = await this.ollamaClient.checkHealth();
    if (!healthy) {
      new Notice(`Stanley: Ollama not reachable at ${this.settings.ollamaBaseUrl}. Indexing skipped.`);
      return;
    }

    void this.indexManager.initialize().then(() => {
      new Notice('Stanley: Vault indexed and ready.');
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_Stanley_SETTINGS,
      (await this.loadData()) as Partial<StanleySettings>
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async activateChatView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]!);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: All tests PASS. Note the count — should be 40+ tests across all files.

- [ ] **Step 3: Run TypeScript check**

```bash
npm run build 2>&1 | tail -20
```

Expected: Compiles successfully to `main.js` with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire all services in main.ts plugin entry point"
```

---

## Task 12: Styles

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Replace `styles.css` with Stanley chat panel styles**

```css
/* Stanley Chat Panel */
.stanley-chat-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 14px;
}

.stanley-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  font-weight: 600;
  flex-shrink: 0;
}

.stanley-title {
  flex: 1;
}

.stanley-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  cursor: help;
}

.stanley-status-ok { background: var(--color-green); }
.stanley-status-error { background: var(--color-red); }
.stanley-status-unknown { background: var(--color-yellow); }

.stanley-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-muted);
}

.stanley-icon-btn:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

/* Message History */
.stanley-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stanley-bubble {
  padding: 8px 12px;
  border-radius: 8px;
  max-width: 90%;
  line-height: 1.5;
  word-break: break-word;
}

.stanley-bubble-user {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  align-self: flex-end;
}

.stanley-bubble-assistant {
  background: var(--background-secondary);
  align-self: flex-start;
}

.stanley-bubble-streaming {
  opacity: 0.85;
}

.stanley-bubble p { margin: 0 0 6px 0; }
.stanley-bubble p:last-child { margin-bottom: 0; }
.stanley-bubble code { font-size: 12px; }
.stanley-bubble blockquote {
  border-left: 3px solid var(--interactive-accent);
  margin: 4px 0;
  padding-left: 8px;
  color: var(--text-muted);
  font-size: 12px;
}

/* Action Buttons */
.stanley-actions {
  display: flex;
  gap: 8px;
  padding: 6px 12px;
  flex-shrink: 0;
}

.stanley-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  cursor: pointer;
  font-size: 13px;
}

.stanley-btn:hover {
  background: var(--background-modifier-hover);
}

/* Input Row */
.stanley-input-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
}

.stanley-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 13px;
  font-family: inherit;
  line-height: 1.4;
}

.stanley-input:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.stanley-send-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  cursor: pointer;
  font-size: 16px;
  flex-shrink: 0;
}

.stanley-send-btn:hover { filter: brightness(1.1); }
.stanley-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Stats Panel */
.stanley-stats-section {
  border-top: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
}

.stanley-stats-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 12px;
  color: var(--text-muted);
  font-size: 12px;
  width: 100%;
  text-align: left;
}

.stanley-stats-toggle:hover { color: var(--text-normal); }

.stanley-stats-content {
  padding: 4px 12px 8px;
}

.stanley-stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 2px 0;
  color: var(--text-muted);
}

.stanley-stat-label { color: var(--text-muted); }
.stanley-stat-value { color: var(--text-normal); font-variant-numeric: tabular-nums; }

.stanley-reindex-btn {
  margin: 4px 12px 8px;
  font-size: 12px;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: add Stanley chat panel styles using Obsidian CSS variables"
```

---

## Task 13: Manifest and CLAUDE.md

**Files:**
- Modify: `manifest.json`
- Create: `CLAUDE.md`

- [ ] **Step 1: Update `manifest.json`**

```json
{
  "id": "stanley-local-plugin",
  "name": "Stanley",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "Privacy-first RAG engine for your Obsidian vault. Chat with your notes using local Ollama models.",
  "author": "mattsclimate",
  "authorUrl": "",
  "isDesktopOnly": true
}
```

- [ ] **Step 2: Create `CLAUDE.md`**

```markdown
# Stanley Obsidian Plugin

Privacy-first RAG chat plugin for Obsidian. Indexes vault notes via local Ollama embeddings and provides a streaming chat interface in the right sidebar.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start esbuild in watch mode (hot reload) |
| `npm run build` | Type-check + production build to `main.js` |
| `npm test` | Run all Vitest unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |

## Architecture

```
src/
├── main.ts                   # Plugin entry, wires all services
├── settings.ts               # StanleySettings interface + settings tab UI
├── types.ts                  # Shared: Chunk, EmbeddedChunk, ChatMessage, PerformanceStats
├── services/
│   ├── OllamaClient.ts       # fetch wrapper: embed(), chat(), checkHealth()
│   ├── VectorStore.ts        # In-memory EmbeddedChunk[] with cosine similarity search
│   ├── EmbeddingService.ts   # chunkNote() + embedChunks() via OllamaClient
│   ├── IndexManager.ts       # First-run / incremental / on-open indexing
│   ├── RAGEngine.ts          # query() → embed → search → prompt → stream
│   └── PerformanceMonitor.ts # recordQuery/Index, getStats, maybeAutoTune
└── views/
    └── ChatView.ts           # Right sidebar ItemView, streaming chat UI
```

## Key Design Decisions

- **In-memory vector store**: Rebuilt on each Obsidian session. Fast for vaults up to ~10k notes. No native deps.
- **Incremental indexing**: `fileModTimes` in plugin data tracks per-file mtimes. Only changed files are re-embedded on load.
- **Auto-tuning**: After every 10 queries, `PerformanceMonitor.maybeAutoTune()` adjusts `topK` and `chunkSize` based on latency and token usage.
- **No external calls**: All inference via local Ollama. `OllamaClient` uses `fetch()` (built into Electron).

## Prerequisites

- [Ollama](https://ollama.com) running locally at `http://localhost:11434`
- Models pulled: `ollama pull nomic-embed-text && ollama pull llama3`

## Testing

Tests are in `tests/`. Each service has a corresponding test file. The Obsidian SDK is mocked in `src/__mocks__/obsidian.ts`.

```bash
npm test                          # run all tests
npm test -- tests/VectorStore     # run one file
```

## Spec and Plan

- Spec: `docs/superpowers/specs/2026-04-13-stanley-plugin-design.md`
- Plan: `docs/superpowers/plans/2026-04-13-stanley-plugin.md`
```

- [ ] **Step 3: Run full test suite one final time**

```bash
npm test 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add manifest.json CLAUDE.md
git commit -m "feat: update manifest metadata and add CLAUDE.md project documentation"
```

---

## Final Verification

- [ ] **Run full build**

```bash
npm run build 2>&1 | tail -10
```

Expected: `main.js` produced with no TypeScript errors.

- [ ] **Confirm all tests pass**

```bash
npm test 2>&1 | grep -E "(PASS|FAIL|Tests)"
```

Expected: All test files PASS, zero failures.
