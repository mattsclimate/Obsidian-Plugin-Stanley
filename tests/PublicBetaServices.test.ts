import { describe, expect, it } from 'vitest';
import { CanvasService } from '../src/services/CanvasService';
import { HybridSearchService } from '../src/services/HybridSearchService';
import { IngestionService } from '../src/services/IngestionService';
import { LibrarianService } from '../src/services/LibrarianService';
import { ModelRouter } from '../src/services/ModelRouter';
import { ModelCatalogService } from '../src/services/ModelCatalogService';
import { MemPalaceService } from '../src/services/MemPalaceService';
import { StanleyTemplateService } from '../src/services/StanleyTemplateService';
import { ChangeLogService } from '../src/services/ChangeLogService';
import { WorkspaceService } from '../src/services/WorkspaceService';

describe('Public beta services', () => {
  it('returns labeled hybrid search results with exact matches before semantic matches', () => {
    const service = new HybridSearchService();

    const results = service.search(
      'water',
      [
        {
          path: 'Projects/Climate.md',
          title: 'Climate',
          content: 'Water stewardship plan',
          properties: { type: 'project' },
        },
        {
          path: 'Concepts/Energy.md',
          title: 'Energy',
          content: 'Grid planning',
          properties: { type: 'concept' },
        },
      ],
      [{ path: 'Concepts/Energy.md', title: 'Energy', snippet: 'Semantic water-energy match' }]
    );

    expect(results.map((r) => r.kind)).toEqual(['exact', 'semantic']);
    expect(results[0]?.path).toBe('Projects/Climate.md');
    expect(results[1]?.label).toBe('Semantic match');
  });

  it('creates visible ingestion records and offers cloud extraction for heavy files', () => {
    const service = new IngestionService();

    expect(service.createRecord('Inbox/report.pdf')).toMatchObject({
      path: 'Inbox/report.pdf',
      type: 'pdf',
      status: 'queued',
      cloudExtractionAvailable: true,
    });
    expect(service.createRecord('Inbox/note.md')).toMatchObject({
      path: 'Inbox/note.md',
      type: 'markdown',
      status: 'extracted',
      cloudExtractionAvailable: false,
    });
  });

  it('adds generated Canvas cards to the Review lane only', () => {
    const service = new CanvasService();
    const canvas = {
      nodes: [
        {
          id: 'review-lane',
          type: 'group',
          label: 'Stanley Review Lane',
          x: 100,
          y: 100,
          width: 500,
          height: 400,
        },
      ],
      edges: [],
    };

    const updated = service.addReviewCard(canvas, 'Proposed project summary');

    expect(updated.nodes).toHaveLength(2);
    expect(updated.nodes[1]).toMatchObject({
      type: 'text',
      text: 'Proposed project summary',
      x: 124,
      y: 148,
    });
  });

  it('suggests workspace mode switches instead of auto-switching', () => {
    const service = new WorkspaceService();

    expect(service.suggestMode('Projects/Stanley.md', 'daily')).toEqual({
      shouldSuggest: true,
      mode: 'project',
      message: 'Open Project workspace?',
    });
    expect(service.suggestMode('Calendar/2026-07-03.md', 'daily').shouldSuggest).toBe(false);
  });

  it('limits librarian automatic fixes to deterministic frontmatter and wikilink casing', () => {
    const service = new LibrarianService();
    const result = service.prepareAutofix(
      '# Climate Note\nSee [[water stewardship]]',
      'Library/Climate Note.md',
      ['Library/Water Stewardship.md']
    );

    expect(result.canAutofix).toBe(true);
    expect(result.content).toContain('type: note');
    expect(result.content).toContain('[[Water Stewardship]]');
    expect(service.canAutofix('move-file')).toBe(false);
  });

  it('keeps local model routing as the default and requires cloud preview approval', () => {
    const router = new ModelRouter();

    expect(router.resolve({ cloudEnabled: false, selectedProvider: 'anthropic' }, 'summarize')).toMatchObject({
      route: 'local-rag',
      requiresPreviewApproval: false,
    });
    expect(router.resolve({ cloudEnabled: true, selectedProvider: 'anthropic', cloudApprovedForRequest: false }, 'deep-synthesis')).toMatchObject({
      route: 'cloud-preview',
      requiresPreviewApproval: true,
    });
    expect(router.resolve({ cloudEnabled: true, selectedProvider: 'anthropic', cloudApprovedForRequest: true }, 'deep-synthesis')).toMatchObject({
      route: 'cloud',
      provider: 'anthropic',
      requiresPreviewApproval: false,
    });
  });

  it('blocks cloud routing in battery saver and routes deterministic tasks to no LLM', () => {
    const router = new ModelRouter();

    expect(router.resolve({ cloudEnabled: true, selectedProvider: 'anthropic', batterySaverMode: true, cloudApprovedForRequest: true }, 'deep-synthesis')).toMatchObject({
      route: 'local-rag',
      reason: 'battery-saver',
    });
    expect(router.resolve({ cloudEnabled: true, selectedProvider: 'anthropic' }, 'librarian-autofix')).toMatchObject({
      route: 'none',
      requiresPreviewApproval: false,
    });
  });

  it('blocks cloud routing when wifi is required but unavailable', () => {
    const router = new ModelRouter();

    expect(router.resolve({
      cloudEnabled: true,
      selectedProvider: 'openai',
      cloudApprovedForRequest: true,
      cloudOnlyOnWifi: true,
      wifiConnected: false,
    }, 'draft')).toMatchObject({
      route: 'local-rag',
      reason: 'wifi-required',
    });
  });

  it('formats and retrieves compact MemPalace episodes', () => {
    const service = new MemPalaceService();
    const episode = service.formatEpisode({
      timestamp: '2026-07-03T12:00:00.000Z',
      action: 'daily-created',
      summary: 'Created daily command center',
      tags: ['daily', 'calendar'],
      paths: ['Calendar/2026-07-03.md'],
    });

    expect(episode).toBe('- 2026-07-03T12:00:00.000Z | daily-created | Created daily command center | tags: daily, calendar | paths: Calendar/2026-07-03.md');

    const memories = [
      episode,
      service.formatEpisode({
        timestamp: '2026-07-03T13:00:00.000Z',
        action: 'source-ingested',
        summary: 'Queued climate report PDF',
        tags: ['source', 'climate'],
        paths: ['Sources/Inbox/report.pdf'],
      }),
    ].join('\n');

    expect(service.findRelevantEpisodes('climate source', memories, 1)).toEqual([
      '- 2026-07-03T13:00:00.000Z | source-ingested | Queued climate report PDF | tags: source, climate | paths: Sources/Inbox/report.pdf',
    ]);
  });

  it('groups local, Claude, Gemini, and ChatGPT model picker metadata', () => {
    const catalog = new ModelCatalogService();
    const groups = catalog.getModelGroups(['llama3', 'phi3'], {
      cloudEnabled: true,
      cloudApiKeys: { anthropic: 'sk-ant', google: '', openai: 'sk-openai' },
    });

    expect(groups.map((group) => group.label)).toEqual(['Local', 'Claude', 'Gemini', 'ChatGPT']);
    expect(groups[0]?.models.map((model) => model.id)).toContain('local:llama3');
    expect(groups[1]?.models.every((model) => model.available)).toBe(true);
    expect(groups[2]?.models.every((model) => model.available)).toBe(false);
    expect(groups[3]?.models.every((model) => model.available)).toBe(true);
  });

  it('generates portable OKF daily templates', () => {
    const service = new StanleyTemplateService();

    const daily = service.dailyNote('2026-07-03');

    expect(daily).toContain('type: daily');
    expect(daily).toContain('# Daily Command Center - 2026-07-03');
    expect(daily).toContain('## Tasks');
    expect(daily).toContain('## Review');
  });

  it('formats Stanley change-log entries for recovery and audit trails', () => {
    const service = new ChangeLogService();

    expect(service.formatEntry({
      timestamp: '2026-07-03T10:00:00.000Z',
      actor: 'stanley',
      action: 'librarian-autofix',
      paths: ['Library/Climate.md'],
      summary: 'Fixed wikilink casing',
    })).toBe('## [2026-07-03T10:00:00.000Z] stanley | librarian-autofix\n- Paths: `Library/Climate.md`\n- Fixed wikilink casing\n');
  });
});
