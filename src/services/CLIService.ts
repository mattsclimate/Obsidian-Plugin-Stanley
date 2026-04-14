import { App, Notice, TFile, MarkdownView } from 'obsidian';

export interface CLICommand {
  command: string;
  args: Record<string, string>;
  flags: Set<string>;
}

export class CLIService {
  constructor(private app: App) {}

  /**
   * Parses a string like: obsidian create name="My Note" silent overwrite
   */
  parse(input: string): CLICommand | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith('obsidian ')) return null;

    const parts = this.tokenize(trimmed.substring(9));
    if (parts.length === 0) return null;

    const command = parts[0]!;
    const args: Record<string, string> = {};
    const flags = new Set<string>();

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]!;
      if (part.includes('=')) {
        const [key, ...valParts] = part.split('=');
        if (key) args[key] = valParts.join('=').replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      } else {
        flags.add(part);
      }
    }

    return { command, args, flags };
  }

  private tokenize(input: string): string[] {
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const tokens: string[] = [];
    let match;
    while ((match = regex.exec(input)) !== null) {
      tokens.push(match[0]!);
    }
    return tokens;
  }

  async execute(cmd: CLICommand): Promise<string> {
    switch (cmd.command) {
      case 'create':
        return await this.handleCreate(cmd);
      case 'read':
        return await this.handleRead(cmd);
      case 'append':
        return await this.handleAppend(cmd);
      case 'open':
        return await this.handleOpen(cmd);
      case 'search':
        return await this.handleSearch(cmd);
      case 'property:set':
        return await this.handlePropertySet(cmd);
      case 'eval':
        return await this.handleEval(cmd);
      default:
        return `Unknown command: ${cmd.command}. Try 'obsidian help'.`;
    }
  }

  private async handleCreate(cmd: CLICommand): Promise<string> {
    const name = cmd.args.name || cmd.args.file || 'Untitled';
    const content = cmd.args.content || '';
    const path = cmd.args.path || (name.endsWith('.md') ? name : `${name}.md`);
    const overwrite = cmd.flags.has('overwrite');

    try {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing) {
        if (!overwrite) return `File already exists: ${path}. Use 'overwrite' flag to replace.`;
        await this.app.vault.modify(existing as TFile, content);
      } else {
        await this.app.vault.create(path, content);
      }
      if (!cmd.flags.has('silent')) {
        await this.app.workspace.getLeaf().setViewState({ type: 'markdown', state: { file: path } });
      }
      return `Created/updated file: ${path}`;
    } catch (err) {
      return `Error creating file: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async handleRead(cmd: CLICommand): Promise<string> {
    const path = cmd.args.path || (cmd.args.file ? (cmd.args.file.endsWith('.md') ? cmd.args.file : `${cmd.args.file}.md`) : null);
    if (!path) {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) return 'No active file and no path provided.';
      return await this.app.vault.read(activeFile);
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return `File not found: ${path}`;
    return await this.app.vault.read(file);
  }

  private async handleAppend(cmd: CLICommand): Promise<string> {
    const path = cmd.args.path || (cmd.args.file ? (cmd.args.file.endsWith('.md') ? cmd.args.file : `${cmd.args.file}.md`) : null);
    const content = cmd.args.content || '';
    if (!path) return 'No path provided for append.';
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return `File not found: ${path}`;
    
    const current = await this.app.vault.read(file);
    await this.app.vault.modify(file, current + '\n' + content);
    return `Appended to ${path}`;
  }

  private async handleOpen(cmd: CLICommand): Promise<string> {
    const path = cmd.args.path || (cmd.args.file ? (cmd.args.file.endsWith('.md') ? cmd.args.file : `${cmd.args.file}.md`) : null);
    if (!path) return 'No path provided to open.';
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return `File not found: ${path}`;
    await this.app.workspace.getLeaf().setViewState({ type: 'markdown', state: { file: path } });
    return `Opened ${path}`;
  }

  private async handleSearch(cmd: CLICommand): Promise<string> {
    const query = cmd.args.query || '';
    if (!query) return 'No search query provided.';
    const files = this.app.vault.getMarkdownFiles();
    const results = files
      .filter(f => f.path.toLowerCase().includes(query.toLowerCase()))
      .slice(0, parseInt(cmd.args.limit || '10'))
      .map(f => f.path);
    
    if (results.length === 0) return `No results found for "${query}"`;
    return `Search results for "${query}":\n` + results.map(r => `- ${r}`).join('\n');
  }

  private async handlePropertySet(cmd: CLICommand): Promise<string> {
    const name = cmd.args.name;
    const value = cmd.args.value;
    const path = cmd.args.path || (cmd.args.file ? (cmd.args.file.endsWith('.md') ? cmd.args.file : `${cmd.args.file}.md`) : null);
    
    if (!name || value === undefined || !path) return 'Missing name, value, or path for property:set';
    
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return `File not found: ${path}`;

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[name] = value;
    });
    return `Set property "${name}" to "${value}" in ${path}`;
  }

  private async handleEval(cmd: CLICommand): Promise<string> {
    const code = cmd.args.code;
    if (!code) return 'No code provided for eval.';
    try {
      // Direct execution with app in scope
      const fn = new Function('app', `return (async () => { ${code} })();`);
      const result = await fn(this.app);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    } catch (err) {
      return `Eval error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
