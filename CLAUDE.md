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
