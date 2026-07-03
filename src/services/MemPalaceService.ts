export interface MemPalaceEpisode {
  timestamp: string;
  action: string;
  summary: string;
  tags: string[];
  paths?: string[];
}

export class MemPalaceService {
  formatEpisode(episode: MemPalaceEpisode): string {
    const parts = [
      `- ${episode.timestamp}`,
      episode.action,
      this.compact(episode.summary, 180),
      `tags: ${episode.tags.join(', ')}`,
    ];
    if (episode.paths && episode.paths.length > 0) {
      parts.push(`paths: ${episode.paths.join(', ')}`);
    }
    return parts.join(' | ');
  }

  findRelevantEpisodes(query: string, content: string, limit = 3): string[] {
    const terms = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2);

    if (terms.length === 0) return [];

    return content
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => ({ line, score: this.score(line, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.line);
  }

  formatContext(episodes: string[]): string {
    if (episodes.length === 0) return '';
    return `--- MEMPALACE EPISODES ---\n${episodes.join('\n')}\n\n`;
  }

  private score(line: string, terms: string[]): number {
    const lower = line.toLowerCase();
    return terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0);
  }

  private compact(value: string, maxLength: number): string {
    const oneLine = value.replace(/\s+/g, ' ').trim();
    return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength - 3)}...`;
  }
}
