# Stanley — Personal Obsidian AI Copilot & RAG Assistant

Stanley is a privacy-first, highly customizable Retrieval-Augmented Generation (RAG) assistant and action executor for your Obsidian vault. It indexes your notes, provides semantic search, answers questions based on your knowledge base, and executes vault operations via a built-in natural language CLI.

Designed to scale down dynamically, Stanley includes hardware-targeted profiles allowing it to run smoothly on low-spec hardware (such as 4GB RAM Pentium devices) by offloading CPU-intensive math to network/cloud providers and optimizing resource footprint.

---

## Key Features

- **Semantic Chat & RAG:** Query your vault using local or cloud AI models. Stanley automatically retrieves relevant note contexts and synthesizes an answer with inline `[[wikilink]]` citations.
- **Natural Language Actions (`obsidian-cli`):** Stanley can propose actions inside the chat. You can review and execute commands to read, create, append, search, or update frontmatter properties directly from the chat sidebar.
- **Slash Commands & Skills:** Reference custom workflows and skill guidelines using `/` triggers, or explicitly attach notes/folders to the conversation context using `@` mentions.
- **Multi-Provider AI Architecture:** Swappable connectors for:
  - **LLM Providers:** Local/Network Ollama, Anthropic Claude, and Google Gemini.
  - **Embedding Providers:** Local Ollama, Google Gemini, OpenAI, and Cohere.
  - **Vector Storage:** In-memory standard, compressed Float32 array, or remote Pinecone vector database.

---

## ⚡ Eco / Low-Spec Hardware Profile

Stanley is optimized for resource-constrained systems (like the Surface Go 2, 4GB RAM) through a dedicated **Eco Mode** toggle:

- **Throttled background queue:** Note indexing runs in a throttled queue. In Eco Mode, it processes only 2 files every 5 seconds (instead of 10 files/second), keeping Obsidian responsive.
- **Event loop lag detection:** A heartbeat monitor checks dispatch latency every 100ms. If UI lag exceeds 100ms or query latency exceeds 8 seconds, Stanley automatically pauses background indexers.
- **Compressed vector memory:** Converts high-dimensional float embeddings to compact `Float32Array` buffers, cutting in-memory RAM usage by >50%.
- **DOM Chat Virtualization:** Renders chat bubbles only when they are visible on screen, swapping offscreen bubbles with lightweight placeholder containers to prevent Electron DOM memory leaks.
- **Aggressive context capping:** Caps the context window to 2,048 tokens and limits character counts before payloads are sent to cloud APIs.

---

## Installation

### Manually installing the plugin
1. Build the production package locally (see commands below).
2. Copy over `main.js`, `styles.css`, and `manifest.json` to your Obsidian vault plugins directory:
   `VaultFolder/.obsidian/plugins/obsidian-plugin-stanley/`
3. Open Obsidian settings, head to **Community Plugins**, and enable **Stanley**.

---

## Development

Prerequisites:
- [NodeJS](https://nodejs.org) (v16+)
- If using local models: [Ollama](https://ollama.com) running at `http://localhost:11434` with `nomic-embed-text` and `llama3` pulled.

### Commands

| Command | What it does |
|---|---|
| `npm install` | Install development dependencies |
| `npm run dev` | Start esbuild compiler in watch mode (hot reload) |
| `npm run build` | Perform Type-checking + production build bundle in `main.js` |
| `npm test` | Run Vitest unit test suites |
| `npm run lint` | Run ESLint checks |

---

## Configuration Settings

- **LLM Chat Provider:** Swap between Ollama, Anthropic Claude, or Google Gemini. Put in cloud API keys when prompted.
- **Embedding Provider:** Choose local Ollama embeddings, or cloud embeddings from Google, OpenAI, or Cohere to eliminate local CPU utilization.
- **Vector Store Type:** Select between standard memory, compressed Float32 memory (recommended for 4GB RAM), or Pinecone remote indexes.
- **Auto-Tuning:** Let Stanley automatically adjust chunk sizes and Top-K retrieval counts based on observed query latencies.

