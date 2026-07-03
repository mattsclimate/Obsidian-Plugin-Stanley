export type SearchKind = 'exact' | 'semantic';

export interface SearchDocument {
  path: string;
  title: string;
  content: string;
  properties: Record<string, string>;
}

export interface SemanticSearchHit {
  path: string;
  title: string;
  snippet: string;
}

export interface HybridSearchResult {
  kind: SearchKind;
  label: 'Exact match' | 'Semantic match';
  path: string;
  title: string;
  snippet: string;
}

export class HybridSearchService {
  search(
    query: string,
    documents: SearchDocument[],
    semanticHits: SemanticSearchHit[] = []
  ): HybridSearchResult[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const exact: HybridSearchResult[] = documents
      .filter((doc) => this.matches(doc, needle))
      .map((doc) => ({
        kind: 'exact' as const,
        label: 'Exact match' as const,
        path: doc.path,
        title: doc.title,
        snippet: this.snippet(doc, needle),
      }));

    const exactPaths = new Set(exact.map((r) => r.path));
    const semantic: HybridSearchResult[] = semanticHits
      .filter((hit) => !exactPaths.has(hit.path))
      .map((hit) => ({
        kind: 'semantic' as const,
        label: 'Semantic match' as const,
        path: hit.path,
        title: hit.title,
        snippet: hit.snippet,
      }));

    return exact.concat(semantic);
  }

  private matches(doc: SearchDocument, needle: string): boolean {
    return [
      doc.path,
      doc.title,
      doc.content,
      ...Object.values(doc.properties),
    ].some((value) => value.toLowerCase().includes(needle));
  }

  private snippet(doc: SearchDocument, needle: string): string {
    const lower = doc.content.toLowerCase();
    const index = lower.indexOf(needle);
    if (index === -1) return doc.content.slice(0, 120);
    const start = Math.max(0, index - 40);
    return doc.content.slice(start, start + 120);
  }
}
