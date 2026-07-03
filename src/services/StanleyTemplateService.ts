export class StanleyTemplateService {
  dailyNote(date: string): string {
    return [
      '---',
      'type: daily',
      `title: Daily Command Center - ${date}`,
      'status: active',
      `created: ${date}`,
      `updated: ${date}`,
      'tags: [daily]',
      '---',
      '',
      `# Daily Command Center - ${date}`,
      '',
      '## Brief',
      '',
      '## Tasks',
      '- [ ] ',
      '',
      '## Open Loops',
      '',
      '## Recent Imports',
      '',
      '## Review',
      '',
    ].join('\n');
  }

  projectNote(title: string): string {
    return [
      '---',
      'type: project',
      `title: ${title}`,
      'status: active',
      'tags: [project]',
      '---',
      '',
      `# ${title}`,
      '',
      '## Goal',
      '',
      '## Current State',
      '',
      '## Tasks',
      '- [ ] ',
      '',
      '## Decisions',
      '',
    ].join('\n');
  }
}
