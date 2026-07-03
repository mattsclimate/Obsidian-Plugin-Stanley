export type LibrarianAction = 'frontmatter-defaults' | 'wikilink-casing' | 'index-log' | 'duplicate-alias' | 'move-file' | 'rename-file' | 'create-page';

export interface AutofixResult {
  canAutofix: boolean;
  content: string;
  changes: LibrarianAction[];
}

export class LibrarianService {
  canAutofix(action: LibrarianAction): boolean {
    return ['frontmatter-defaults', 'wikilink-casing', 'index-log', 'duplicate-alias'].includes(action);
  }

  prepareAutofix(content: string, path: string, knownPaths: string[]): AutofixResult {
    let next = content;
    const changes: LibrarianAction[] = [];

    if (!next.startsWith('---\n')) {
      next = this.addFrontmatter(next, path);
      changes.push('frontmatter-defaults');
    }

    const fixedLinks = this.fixWikilinkCasing(next, knownPaths);
    if (fixedLinks !== next) {
      next = fixedLinks;
      changes.push('wikilink-casing');
    }

    return {
      canAutofix: changes.every((change) => this.canAutofix(change)),
      content: next,
      changes,
    };
  }

  private addFrontmatter(content: string, path: string): string {
    const title = (path.split('/').pop() ?? path).replace(/\.md$/, '');
    return [
      '---',
      'type: note',
      `title: ${title}`,
      'status: active',
      '---',
      '',
      content,
    ].join('\n');
  }

  private fixWikilinkCasing(content: string, knownPaths: string[]): string {
    const basenameMap = new Map(
      knownPaths.map((path) => {
        const basename = (path.split('/').pop() ?? path).replace(/\.md$/, '');
        return [basename.toLowerCase(), basename] as const;
      })
    );

    return content.replace(/\[\[([^\]]+)\]\]/g, (full, target: string) => {
      const replacement = basenameMap.get(target.toLowerCase());
      return replacement ? `[[${replacement}]]` : full;
    });
  }
}
