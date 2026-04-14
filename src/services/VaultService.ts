import { App, TFile, TFolder, TAbstractFile } from 'obsidian';

export interface VaultItem {
  id: string; // path
  name: string;
  type: 'file' | 'folder';
  path: string;
}

export class VaultService {
  constructor(private app: App) {}

  searchItems(query: string): VaultItem[] {
    const lowerQuery = query.toLowerCase();
    const allFiles = this.app.vault.getAllLoadedFiles();
    
    return allFiles
      .filter(f => {
        // Only show markdown files or folders
        if (f instanceof TFile && f.extension !== 'md') return false;
        return f.path.toLowerCase().includes(lowerQuery) || f.name.toLowerCase().includes(lowerQuery);
      })
      .slice(0, 50) // Limit suggestions
      .map(f => ({
        id: f.path,
        name: f.name,
        type: f instanceof TFolder ? 'folder' : 'file',
        path: f.path
      }));
  }

  async readItemContext(path: string): Promise<string | null> {
    const item = this.app.vault.getAbstractFileByPath(path);
    if (!item) return null;

    if (item instanceof TFile) {
      const content = await this.app.vault.read(item);
      return `[[${item.path}]]\n${content}`;
    } else if (item instanceof TFolder) {
      const files = item.children.filter(f => f instanceof TFile && f.extension === 'md') as TFile[];
      // Limit to first 5 files in a folder to keep context reasonable
      const limitedFiles = files.slice(0, 5);
      let content = `FOLDER: [[${item.path}]]\n`;
      for (const f of limitedFiles) {
        const c = await this.app.vault.read(f);
        content += `\n--- [[${f.path}]] ---\n${c}\n`;
      }
      if (files.length > 5) {
        content += `\n... (plus ${files.length - 5} more files omitted) ...\n`;
      }
      return content;
    }

    return null;
  }
}
