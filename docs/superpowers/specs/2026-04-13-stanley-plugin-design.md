# Stanley Plugin Design Spec
**Date:** 2026-04-13
**Status:** Approved

---

## Overview

Stanley is a privacy-first Obsidian plugin that provides a Retrieval-Augmented Generation (RAG) engine over the user's local vault. It generates embeddings for all notes using a locally hosted Ollama model, stores them in memory for fast similarity search, and exposes a chat interface in the right sidebar. The assistant can answer questions using vault context, insert generated text into the active note, and create new notes from responses.

---

## Goals

- Full RAG pipeline over the local vault using Ollama (no external API calls)
- Privacy-first: all inference runs locally, no data leaves the machine
- Incremental indexing: first-run full index, subsequent loads only re-embed changed files, plus on-open re-indexing
- Right sidebar chat panel with streaming responses and wikilink citations
- Write actions: insert into current note, create new note from response
- Performance stats panel + auto-tuning of chunk size, top-K, and chunk overlap

## Non-Goals

- Cloud model support (by design — privacy-first)
- Full vault write access (only insert-at-cursor and create-new-note)
- Persistent vector storage (in-memory only, rebuilt each session)
- Mobile support (desktop only for Ollama integration)

---

## Architecture

### Approach: Layered Service Architecture

Each service has a single responsibility and communicates through well-defined interfaces. `main.ts` wires all services together on plugin load.

```
src/
├── main.ts                   # Plugin entry point, wires all services
├── settings.ts               # Settings interface, defaults, settings tab UI
├── types.ts                  # Shared interfaces
├── services/
│   ├── OllamaClient.ts       # HTTP wrapper for Ollama REST API
│   ├── EmbeddingService.ts   # Chunks note content, requests embeddings
│   ├── VectorStore.ts        # In-memory store with cosine similarity search
│   ├── IndexManager.ts       # Orchestrates first-run, incremental, on-open indexing
│   ├── RAGEngine.ts          # Query → retrieve → prompt → generate pipeline
│   └── PerformanceMonitor.ts # Latency/token tracking + auto-tuning
└── views/
    └── ChatView.ts           # Obsidian ItemView: sidebar panel + stats display
```

### Startup Sequence

```
onload()
  → loadSettings()
  → OllamaClient.checkHealth()      — warn if Ollama unreachable
  → IndexManager.initialize()
      → if no fileModTimes: full index of all vault markdown files
      → else: incremental index (re-embed changed/new files only)
  → ChatView registered and ready
```

---

## Data Types (`types.ts`)

```typescript
interface Chunk {
  filePath: string;
  content: string;       // raw text slice of the note
  charOffset: number;    // position in source file
}

interface EmbeddedChunk extends Chunk {
  embedding: number[];   // float vector from Ollama
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface PerformanceStats {
  lastIndexDurationMs: number;
  avgQueryLatencyMs: number;
  totalTokensUsed: number;
  indexedChunkCount: number;
  cacheHitRate: number;        // % of notes skipped on incremental re-index
}
```

---

## Settings (`settings.ts`)

```typescript
interface StanleySettings {
  ollamaBaseUrl: string;                   // default: http://localhost:11434
  embeddingModel: string;                  // default: nomic-embed-text
  chatModel: string;                       // default: llama3
  chunkSize: number;                       // chars per chunk, default: 500, auto-tuned
  chunkOverlap: number;                    // overlap between chunks, default: 50
  topK: number;                            // chunks retrieved per query, default: 5, auto-tuned
  maxContextTokens: number;               // context window budget, default: 4096
  autoTuneEnabled: boolean;               // default: true
  fileModTimes: Record<string, number>;   // filePath → mtime, persisted for incremental index
}
```

Settings are saved via Obsidian's `plugin.saveData()` / `plugin.loadData()` mechanism. `fileModTimes` is the persistence layer for incremental indexing — it survives plugin reloads.

---

## Services

### `OllamaClient`

Thin HTTP wrapper around the Ollama REST API. All methods throw descriptive errors if Ollama is unreachable.

```typescript
embed(text: string): Promise<number[]>
  // POST /api/embeddings — returns float vector

chat(messages: ChatMessage[], onToken: (t: string) => void): Promise<string>
  // POST /api/chat with stream:true — calls onToken for each streamed token

checkHealth(): Promise<boolean>
  // GET /api/tags — returns true if reachable, false otherwise
```

### `EmbeddingService`

Responsible for turning raw note content into `EmbeddedChunk[]`.

**Chunking strategy:**
1. Split on paragraph breaks (`\n\n`) first
2. Apply sliding window with `chunkSize` (chars) and `chunkOverlap`
3. Prepend note title to each chunk: `[Note Title]\n{chunk content}`
4. Skip empty files, non-markdown files, and Obsidian system files

```typescript
chunkNote(file: TFile, content: string, settings: StanleySettings): Chunk[]
embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]>
```

### `VectorStore`

In-memory flat array of `EmbeddedChunk[]`. No external dependencies.

```typescript
insert(chunks: EmbeddedChunk[]): void
removeByFile(filePath: string): void      // called before re-indexing a file
search(queryEmbedding: number[], topK: number): EmbeddedChunk[]
  // cosine similarity over all vectors, returns top-K sorted by score
clear(): void
get size(): number
```

Cosine similarity: `dot(a, b) / (|a| * |b|)`. Computed over the full in-memory array per query — acceptable for vaults up to ~10k notes.

### `IndexManager`

Orchestrates all three indexing modes. Reads and writes `settings.fileModTimes`.

**First-run:** `fileModTimes` is empty → queue all `.md` files → process in batches of 10 (prevents Ollama overload) → update `fileModTimes` on each file completion → save settings.

**Incremental (on load):** For each `.md` file, compare `file.stat.mtime` to stored value. Queue only new or changed files. Unchanged files are skipped (counted toward cache hit rate).

**On-open / on-modify:** Listens to `vault.on('modify')` and `workspace.on('file-open')`. Re-indexes the single changed file: calls `VectorStore.removeByFile()` then re-embeds and inserts.

```typescript
initialize(): Promise<void>
reindexAll(): Promise<void>    // exposed for "Re-index vault" button
```

### `RAGEngine`

The query pipeline. Receives `OllamaClient`, `VectorStore`, and `PerformanceMonitor` via constructor injection. Config comes from settings passed per-call.

```typescript
constructor(client: OllamaClient, store: VectorStore, monitor: PerformanceMonitor)

query(
  userQuery: string,
  settings: StanleySettings,
  onToken: (t: string) => void
): Promise<string>
```

**Pipeline:**
1. `OllamaClient.embed(userQuery)` → query vector
2. `VectorStore.search(queryVector, topK)` → top-K `EmbeddedChunk[]`
3. Build context block: chunks joined with `\n---\n`, each prefixed with `> from [[filePath]]`
4. Construct prompt (see prompt template below)
5. `OllamaClient.chat(messages, onToken)` → stream response tokens to `ChatView`
6. `PerformanceMonitor.recordQuery(latencyMs, tokenCount)`

**Prompt template:**
```
You are a knowledge assistant for a personal Obsidian vault.
Answer the question using only the context provided below.
If the answer is not in the context, say "I couldn't find that in your vault."
Cite the source notes using [[wikilink]] format.

Context:
{retrieved chunks with citations}

Question: {userQuery}
```

### `PerformanceMonitor`

Records metrics and periodically auto-tunes settings.

**Tracked metrics:**
- Per-query: embed latency, retrieve latency, generate latency, token count
- Per-index: file count, duration, cache hit rate (skipped / total)

**Auto-tuning (runs after every 10 queries, if `autoTuneEnabled: true`):**

| Condition | Adjustment |
|---|---|
| Avg query latency > 8s | Reduce `topK` by 1 (min: 3) |
| Avg query latency < 2s | Increase `topK` by 1 (max: 10) |
| Token usage ≥ 95% of `maxContextTokens` in 3+ of last 10 queries | Reduce `chunkSize` by 50 chars (min: 200) |
| Std dev of top-K similarity scores > 0.15 across last 10 queries | Increase `chunkOverlap` by 25 chars (max: 150) |

Auto-tune calls `plugin.saveSettings()` after adjustments. Never runs during active indexing. `RAGEngine` calls `monitor.maybeAutoTune(settings)` after each query and applies any returned setting changes.

```typescript
recordQuery(embedMs: number, retrieveMs: number, generateMs: number, tokens: number): void
recordIndex(fileCount: number, durationMs: number, cacheHitRate: number): void
getStats(): PerformanceStats
maybeAutoTune(settings: StanleySettings): StanleySettings  // returns updated settings
```

---

## Chat View (`views/ChatView.ts`)

Registered as an Obsidian `ItemView` in the right sidebar. View type: `stanley-chat-view`.

### Panel Layout

```
┌─────────────────────────────┐
│  Stanley  [●connected] [⚙]      │  ← header: Ollama status dot, opens settings
├─────────────────────────────┤
│                             │
│  [chat message history]     │  ← scrollable div, markdown-rendered
│                             │     citations as live [[wikilinks]]
│                             │
├─────────────────────────────┤
│  [Insert] [New Note]        │  ← shown after assistant response only
├─────────────────────────────┤
│  Ask your vault...      [↑] │  ← textarea + send (Enter key or button)
├─────────────────────────────┤
│  ▶ Stats                    │  ← collapsible stats panel
└─────────────────────────────┘
```

### Interaction Details

- Responses stream token-by-token into the active message bubble — no full re-renders
- `MarkdownRenderer.renderMarkdown()` used for final response rendering (vault theme compatible)
- Citations rendered as `[[wikilinks]]` — clicking opens source note in editor
- **Insert:** appends last assistant response at cursor via `editor.replaceSelection()`
- **New Note:** prompts for title (pre-filled from query text), calls `vault.create(title + '.md', content)`
- Status dot: green (connected), amber (slow), red (unreachable)

### Stats Panel (collapsible)

- Indexed chunks count
- Last index duration
- Avg query latency (ms)
- Total tokens used
- Cache hit rate (%)
- "Re-index vault" button → calls `IndexManager.reindexAll()`

---

## Error Handling

- Ollama unreachable at startup → `Notice` warning, chat input disabled with message "Ollama not reachable at {url}"
- Ollama goes down mid-session → error shown inline in chat bubble, input re-enabled for retry
- Empty vault / no indexed chunks → chat responds with "No notes indexed yet. Try re-indexing."
- File deleted between index and query → `VectorStore.removeByFile()` called on `vault.on('delete')` event

---

## Settings Tab

Configured via Obsidian's native settings tab. Fields:

| Setting | Type | Default | Notes |
|---|---|---|---|
| Ollama URL | text | `http://localhost:11434` | validated on change |
| Embedding model | text | `nomic-embed-text` | |
| Chat model | text | `llama3` | |
| Chunk size | slider | 500 | 200–1000 chars |
| Chunk overlap | slider | 50 | 0–150 chars |
| Top-K | slider | 5 | 3–10 |
| Max context tokens | number | 4096 | |
| Auto-tune | toggle | on | |

Auto-tuned fields (chunk size, top-K, chunk overlap) show their current auto-tuned value in the UI.

---

## Build & Tooling

No changes to existing build setup required for Phase 1. Additional npm dependencies to add:

- None for core functionality — Ollama is accessed via `fetch()` (built into Obsidian's Electron runtime)
- No native binaries required

The existing `esbuild.config.mjs` and `tsconfig.json` are sufficient as-is.

---

## Out of Scope (Future)

- Persistent vector store (SQLite, JSON file)
- Note graph visualization of semantic clusters
- Multi-vault support
- Ollama model management UI (pull, delete models)
- Conversation history persistence across sessions
