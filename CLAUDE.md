# Stanley Obsidian Plugin

Local-first RAG chat plugin for Obsidian. Indexes vault notes via local Ollama embeddings and provides a streaming chat interface in the right sidebar. Cloud models (Anthropic/Google/OpenAI) are opt-in and off by default — see Cloud Models below.

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
│   ├── RAGEngine.ts          # query() → embed → search → prompt → route (local/cloud) → stream
│   ├── ModelRouter.ts        # Decides local-fast/local-rag/cloud-preview/cloud per task + settings
│   ├── CloudModelClient.ts   # fetch wrappers for Anthropic/Google/OpenAI completions
│   ├── ModelCatalogService.ts# Builds the model picker's local + cloud option groups
│   └── PerformanceMonitor.ts # recordQuery/Index, getStats, maybeAutoTune
└── views/
    └── ChatView.ts           # Right sidebar ItemView, streaming chat UI
```

## Key Design Decisions

- **In-memory vector store**: Rebuilt on each Obsidian session. Fast for vaults up to ~10k notes. No native deps.
- **Incremental indexing**: `fileModTimes` in plugin data tracks per-file mtimes. Only changed files are re-embedded on load.
- **Auto-tuning**: After every 10 queries, `PerformanceMonitor.maybeAutoTune()` adjusts `topK` and `chunkSize` based on latency and token usage.
- **Local by default**: All inference runs via local Ollama unless the user explicitly enables and selects a cloud model.

## Cloud Models

Cloud models (Anthropic, Google, OpenAI) are off by default (`cloudEnabled: false`). When enabled, `ModelRouter` still routes most tasks to `local-rag`; only tasks in `cloudUsefulFor` (`deep-synthesis`, `draft`, `large-extraction`, `reorg-plan`) can route to cloud, and even then the first request for a given approval-window returns a `cloud-preview` — the exact prompt that will be sent, unabbreviated at the point of send — and requires an explicit "Send to cloud" click before `CloudModelClient` is called. `RAGEngine.query()`'s `precomputedPrompt` option guarantees the approved preview and the request actually sent are byte-identical (no re-embed/re-search in between). API keys live in plugin data (`data.json`) in plaintext for v1 — Obsidian has no encrypted secret store — so treat that file as sensitive.

Retrieved vault content is treated as untrusted data in the system prompt (see the `CONTEXT SAFETY` block in `RAGEngine.ts`): the model is instructed not to follow directives that appear inside retrieved notes, since RAG context is attacker-reachable if a vault ever ingests untrusted files.

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
