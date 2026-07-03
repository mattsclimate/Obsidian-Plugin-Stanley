export interface StanleyChangeLogEntry {
  timestamp: string;
  actor: 'stanley' | 'user';
  action: string;
  paths: string[];
  summary: string;
}

export class ChangeLogService {
  formatEntry(entry: StanleyChangeLogEntry): string {
    const paths = entry.paths.map((path) => `\`${path}\``).join(', ');
    return [
      `## [${entry.timestamp}] ${entry.actor} | ${entry.action}`,
      `- Paths: ${paths}`,
      `- ${entry.summary}`,
      '',
    ].join('\n');
  }
}
