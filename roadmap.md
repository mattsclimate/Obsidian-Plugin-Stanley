# Stanley Development Roadmap

## Vision
To transform Obsidian into a **Sovereign Intelligence Engine** where your knowledge doesn't just sit in files, but actively aids in your thinking and task execution.

## 2026 Q2: Foundation & Retrieval (Current)
- [x] **Local LLM Integration**: Full support for Ollama (Llama 3, Mistral, etc.).
- [x] **High-Performance RAG**: Real-time vector search and context-aware responses.
- [x] **Performance Monitoring**: Real-time stats on query latency and token usage.
- [/] **Robust File Operations**: Enable Stanley to create, modify, and organize notes automatically.

### Plan: Fix File Creation Issue
1. **Tool Protocol**: Introduce a structured XML-tag format for model actions (e.g., `<create_file>`).
2. **System Prompt Update**: Instruct the RAG engine to use these tags when user intent involves vault modifications.
3. **Action Parser**: Implement a streaming parser in the Chat UI to detect and execute vault commands.
4. **User Feedback**: Ensure clear notifications (Notices) when Stanley performs an action.

## 2026 Q3: Agentic Capabilities
- [ ] **Structured Tool-Use**: Implement a reliable "Tool Protocol" for vault operations.
- [ ] **Multi-Model Support**: Support for external providers (Gemini, OpenAI, Anthropic) if the user opts in.
- [ ] **Advanced Text Extraction**: Better handling of PDFs, images, and non-markdown content.
- [ ] **Canvas Integration**: Allow Stanley to read from and modify Obsidian Canvas files.

## 2026 Q4: Knowledge Compounding
- [ ] **Autonomous Research**: Stanley can "browse" your vault to find hidden connections while you sleep.
- [ ] **Plugin Ecosystem Integration**: API for other plugins to use Stanley as their intelligence layer.

## Long-term Vision
- **True Sovereign Intelligence**: A personal AI that has zero external dependencies and full context of your entire digital life, starting with your notes.
