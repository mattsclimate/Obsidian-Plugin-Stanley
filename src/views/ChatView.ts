import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, setIcon, Menu } from 'obsidian';
import type StanleyPlugin from '../main';
import type { RAGEngine } from '../services/RAGEngine';
import type { IndexManager } from '../services/IndexManager';
import type { PerformanceMonitor } from '../services/PerformanceMonitor';
import type { CLIService } from '../services/CLIService';
import type { SkillService, Skill } from '../services/SkillService';
import type { VaultService, VaultItem } from '../services/VaultService';
import type { ChatMessage } from '../types';

export const VIEW_TYPE_CHAT = 'stanley-chat-view';

export class ChatView extends ItemView {
  private plugin: StanleyPlugin;
  private ragEngine: RAGEngine;
  private indexManager: IndexManager;
  private monitor: PerformanceMonitor;
  private cliService: CLIService;
  private skillService: SkillService;
  private vaultService: VaultService;

  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private statusDot!: HTMLElement;
  private statsContentEl!: HTMLElement;
  private suggestMenuEl!: HTMLElement;
  private modelSelectorEl!: HTMLElement;

  private lastQuery = '';

  constructor(
    leaf: WorkspaceLeaf,
    plugin: StanleyPlugin,
    ragEngine: RAGEngine,
    indexManager: IndexManager,
    monitor: PerformanceMonitor,
    cliService: CLIService,
    skillService: SkillService,
    vaultService: VaultService
  ) {
    super(leaf);
    this.plugin = plugin;
    this.ragEngine = ragEngine;
    this.indexManager = indexManager;
    this.monitor = monitor;
    this.cliService = cliService;
    this.skillService = skillService;
    this.vaultService = vaultService;
  }

  getViewType(): string { return VIEW_TYPE_CHAT; }
  getDisplayText(): string { return 'Stanley Chat'; }
  getIcon(): string { return 'message-circle'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('stanley-chat-root');

    this.renderHeader(root);
    this.messagesEl = root.createDiv({ cls: 'stanley-messages' });
    this.renderInputArea(root);
    this.renderStatsFooter(root);

    await this.updateStatus();
    this.plugin.registerDomEvent(window, 'click', (e) => this.handleGlobalClick(e));
  }

  async onClose(): Promise<void> {}

  private renderHeader(root: HTMLElement): void {
    const header = root.createDiv({ cls: 'stanley-header' });
    
    const left = header.createDiv({ cls: 'stanley-header-left' });
    this.statusDot = left.createDiv({ cls: 'stanley-status-dot stanley-status-unknown' });
    left.createEl('span', { text: 'Stanley', cls: 'stanley-title' });

    const right = header.createDiv({ cls: 'stanley-header-actions' });
    const settingsBtn = right.createDiv({ cls: 'stanley-icon-btn' });
    setIcon(settingsBtn, 'settings');
    settingsBtn.title = 'Stanley settings';
    settingsBtn.addEventListener('click', () => {
      // @ts-ignore
      this.app.setting?.open?.();
      // @ts-ignore
      this.app.setting?.openTabById?.('stanley');
    });
  }

  private renderInputArea(root: HTMLElement): void {
    const container = root.createDiv({ cls: 'stanley-input-container' });

    this.inputEl = container.createEl('textarea', {
      cls: 'stanley-input',
      attr: { placeholder: 'Ask your vault...', rows: '1' },
    }) as HTMLTextAreaElement;

    // Auto-resize textarea
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = `${this.inputEl.scrollHeight}px`;
      void this.handleInput();
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSend();
      }
    });

    const toolbar = container.createDiv({ cls: 'stanley-input-toolbar' });
    const left = toolbar.createDiv({ cls: 'stanley-toolbar-left' });
    
    this.modelSelectorEl = left.createDiv({ cls: 'stanley-model-selector' });
    this.updateModelSelectorText();
    this.modelSelectorEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showModelDropdown(this.modelSelectorEl);
    });

    this.sendBtn = toolbar.createEl('button', { cls: 'stanley-send-btn' });
    setIcon(this.sendBtn, 'arrow-up');
    this.sendBtn.addEventListener('click', () => void this.handleSend());

    this.suggestMenuEl = root.createDiv({ cls: 'stanley-suggest-menu' });
    this.suggestMenuEl.hide();
  }

  private updateModelSelectorText(): void {
    this.modelSelectorEl.empty();
    const name = this.plugin.settings.chatModel.split(':')[0] || this.plugin.settings.chatModel;
    this.modelSelectorEl.createEl('span', { text: name });
    const icon = this.modelSelectorEl.createDiv({ cls: 'stanley-selector-chevron' });
    setIcon(icon, 'chevron-down');
  }

  private async showModelDropdown(anchor: HTMLElement): Promise<void> {
    const existing = document.querySelector('.stanley-dropdown-menu');
    if (existing) {
      existing.remove();
      return;
    }

    const menu = document.body.createDiv({ cls: 'stanley-dropdown-menu' });
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;

    const models = await this.plugin.ollamaClient.listModels();
    
    for (const model of models) {
      const item = menu.createDiv({ 
        cls: `stanley-dropdown-item ${model === this.plugin.settings.chatModel ? 'is-selected' : ''}` 
      });
      const name = model.split(':')[0] || model;
      item.createDiv({ text: name, cls: 'stanley-model-name' });
      
      // Artificial descriptions for a premium feel
      let desc = 'Standard model';
      if (model.includes('llama3')) desc = 'Most capable for ambitious work';
      if (model.includes('mistral')) desc = 'Efficient for everyday tasks';
      if (model.includes('phi3')) desc = 'Fastest for quick answers';
      
      item.createDiv({ text: desc, cls: 'stanley-model-desc' });
      
      item.addEventListener('click', async () => {
        this.plugin.settings.chatModel = model;
        this.plugin.ollamaClient.chatModel = model;
        await this.plugin.saveSettings();
        this.updateModelSelectorText();
        menu.remove();
      });
    }

    menu.createDiv({ cls: 'stanley-dropdown-divider' });

    const footer = menu.createDiv({ cls: 'stanley-dropdown-footer' });
    const label = footer.createDiv({ cls: 'stanley-toggle-label' });
    label.createDiv({ text: 'Extended thinking', cls: 'stanley-model-name' });
    label.createDiv({ text: 'Think longer for complex tasks', cls: 'stanley-model-desc' });

    const toggleWrap = footer.createEl('label', { cls: 'stanley-toggle' });
    const checkbox = toggleWrap.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
    checkbox.checked = this.plugin.settings.extendedThinking;
    toggleWrap.createDiv({ cls: 'stanley-slider' });

    checkbox.addEventListener('change', async () => {
      this.plugin.settings.extendedThinking = checkbox.checked;
      await this.plugin.saveSettings();
    });
  }

  private handleGlobalClick(e: MouseEvent): void {
    const menu = document.querySelector('.stanley-dropdown-menu');
    if (menu && !menu.contains(e.target as Node)) {
      menu.remove();
    }
  }

  private async handleInput(): Promise<void> {
    const value = this.inputEl.value;
    const cursor = this.inputEl.selectionStart;
    const textBeforeCursor = value.substring(0, cursor);
    
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const lastSlash = textBeforeCursor.lastIndexOf('/');
    
    if (lastAt !== -1 && (lastAt === 0 || /\s/.test(textBeforeCursor[lastAt - 1]!))) {
      const query = textBeforeCursor.substring(lastAt + 1).toLowerCase();
      const items = this.vaultService.searchItems(query);
      if (items.length > 0) {
        this.renderSuggestMenu(items, 'mention', lastAt);
      } else {
        this.suggestMenuEl.hide();
      }
    } else if (lastSlash !== -1 && (lastSlash === 0 || /\s/.test(textBeforeCursor[lastSlash - 1]!))) {
      const query = textBeforeCursor.substring(lastSlash + 1).toLowerCase();
      const skills = await this.skillService.listSkills();
      const filtered = skills.filter(s => s.id.includes(query) || s.name.toLowerCase().includes(query));
      if (filtered.length > 0) {
        this.renderSuggestMenu(filtered, 'skill', lastSlash);
      } else {
        this.suggestMenuEl.hide();
      }
    } else {
      this.suggestMenuEl.hide();
    }
  }

  private renderSuggestMenu(items: (Skill | VaultItem)[], type: 'skill' | 'mention', triggerPos: number): void {
    this.suggestMenuEl.empty();
    this.suggestMenuEl.show();

    const inputRect = this.inputEl.getBoundingClientRect();
    const rootRect = (this.containerEl.children[1] as HTMLElement).getBoundingClientRect();
    
    this.suggestMenuEl.style.bottom = `${rootRect.bottom - inputRect.top + 12}px`;
    this.suggestMenuEl.style.left = `12px`;
    this.suggestMenuEl.style.width = `calc(100% - 24px)`;

    for (const item of items) {
      const row = this.suggestMenuEl.createDiv({ cls: 'stanley-suggest-item' });
      const iconEl = row.createDiv({ cls: 'stanley-suggest-icon' });
      const info = row.createDiv({ cls: 'stanley-suggest-info' });
      
      if (type === 'skill') {
        const s = item as Skill;
        setIcon(iconEl, 'zap');
        info.createDiv({ text: s.name, cls: 'stanley-suggest-name' });
        info.createDiv({ text: `/${s.id}`, cls: 'stanley-suggest-path' });
        row.addEventListener('click', () => {
          this.applySuggestion(`/${s.id} `, triggerPos);
        });
      } else {
        const v = item as VaultItem;
        setIcon(iconEl, v.type === 'folder' ? 'folder' : 'file-text');
        info.createDiv({ text: v.name, cls: 'stanley-suggest-name' });
        info.createDiv({ text: v.path, cls: 'stanley-suggest-path' });
        row.addEventListener('click', () => {
          this.applySuggestion(`[[${v.path}]] `, triggerPos);
        });
      }
    }
  }

  private applySuggestion(replacement: string, triggerPos: number): void {
    const value = this.inputEl.value;
    const cursor = this.inputEl.selectionStart;
    const before = value.substring(0, triggerPos);
    const after = value.substring(cursor);
    this.inputEl.value = before + replacement + after;
    this.suggestMenuEl.hide();
    this.inputEl.focus();
    // Trigger auto-resize
    this.inputEl.style.height = 'auto';
    this.inputEl.style.height = `${this.inputEl.scrollHeight}px`;
  }

  private renderStatsFooter(root: HTMLElement): void {
    const footer = root.createDiv({ cls: 'stanley-stats-footer' });
    
    const header = footer.createDiv({ cls: 'stanley-stats-header' });
    const left = header.createDiv();
    setIcon(left, 'bar-chart-2');
    left.createEl('span', { text: ' Performance Stats' });
    
    const chevron = header.createDiv();
    setIcon(chevron, this.plugin.settings.showStats ? 'chevron-down' : 'chevron-right');

    this.statsContentEl = footer.createDiv({ cls: 'stanley-stats-content' });
    if (this.plugin.settings.showStats) this.statsContentEl.addClass('is-expanded');

    header.addEventListener('click', () => {
      const isExpanded = this.statsContentEl.hasClass('is-expanded');
      this.statsContentEl.toggleClass('is-expanded', !isExpanded);
      chevron.empty();
      setIcon(chevron, !isExpanded ? 'chevron-down' : 'chevron-right');
      
      this.plugin.settings.showStats = !isExpanded;
      void this.plugin.saveSettings();
      if (!isExpanded) this.refreshStats();
    });

    if (this.plugin.settings.showStats) this.refreshStats();
  }

  private refreshStats(): void {
    const stats = this.monitor.getStats();
    this.statsContentEl.empty();
    
    const grid = this.statsContentEl.createDiv({ cls: 'stanley-stat-grid' });
    
    const rows: [string, string, string][] = [
      ['Indexed chunks', String(stats.indexedChunkCount), 'layers'],
      ['Latency', `${stats.lastIndexDurationMs}ms`, 'clock'],
      ['Query Avg', `${Math.round(stats.avgQueryLatencyMs)}ms`, 'search'],
      ['Total Tokens', String(stats.totalTokensUsed), 'cpu'],
    ];

    for (const [label, value, icon] of rows) {
      const item = grid.createDiv({ cls: 'stanley-stat-item' });
      item.createDiv({ text: label, cls: 'stanley-stat-label' });
      item.createDiv({ text: value, cls: 'stanley-stat-value' });
    }

    const actions = this.statsContentEl.createDiv({ cls: 'stanley-stat-actions' });
    const reindexBtn = actions.createEl('button', { text: 'Re-index vault', cls: 'stanley-btn' });
    reindexBtn.addEventListener('click', () => {
      new Notice('Stanley: Re-indexing vault...');
      void this.indexManager.reindexAll().then(() => {
        new Notice('Stanley: Re-index complete.');
        this.refreshStats();
      });
    });
  }

  private async updateStatus(): Promise<void> {
    const healthy = await this.plugin.ollamaClient.checkHealth();
    this.statusDot.removeClass('stanley-status-unknown', 'stanley-status-ok', 'stanley-status-error');
    if (healthy) {
      this.statusDot.addClass('stanley-status-ok');
      this.statusDot.title = 'Ollama connected';
    } else {
      this.statusDot.addClass('stanley-status-error');
      this.statusDot.title = `Ollama unreachable`;
      this.appendMessage(
        'assistant',
        `⚠ Ollama not reachable at \`${this.plugin.settings.ollamaBaseUrl}\`.`
      );
    }
  }

  private async handleSend(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query) return;

    this.lastQuery = query;
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.sendBtn.disabled = true;

    this.appendMessage('user', query);

    const streamingEl = this.appendStreamingBubble();
    let streamedText = '';

    try {
      let finalQuery = query;
      let explicitContext: { path: string, content: string }[] = [];

      if (query.startsWith('/')) {
        const firstSpace = query.indexOf(' ');
        const skillId = firstSpace === -1 ? query.substring(1).toLowerCase() : query.substring(1, firstSpace).toLowerCase();
        const skillContent = await this.skillService.getSkillContent(skillId);
        if (skillContent) {
          const userQueryPart = firstSpace === -1 ? '' : query.substring(firstSpace).trim();
          finalQuery = `SKILL INSTRUCTIONS:\n${skillContent}\n\nUSER REQUEST:\n${userQueryPart}`;
        }
      }

      const mentionRegex = /\[\[([^\]]+)\]\]/g;
      let match;
      while ((match = mentionRegex.exec(query)) !== null) {
        const path = match[1]!;
        const content = await this.vaultService.readItemContext(path);
        if (content) explicitContext.push({ path, content });
      }

      const result = await this.ragEngine.query(
        finalQuery,
        this.plugin.settings,
        (token) => {
          streamedText += token;
          streamingEl.textContent = streamedText;
          this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: 'smooth' });
        },
        explicitContext
      );

      await this.parseAndExecuteActions(result.response);
      const cleanResponse = this.stripActionTags(result.response);
      streamingEl.textContent = '';
      await MarkdownRenderer.renderMarkdown(cleanResponse, streamingEl, '', this);

      if (result.settings !== this.plugin.settings) {
        this.plugin.settings = result.settings;
        await this.plugin.saveSettings();
      }
    } catch (err) {
      streamingEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.sendBtn.disabled = false;
      this.inputEl.focus();
    }
  }

  private async parseAndExecuteActions(text: string): Promise<void> {
    const lines = text.split('\n');
    let pendingLabel: string | undefined;
    for (const line of lines) {
      const actionMatch = line.match(/^\[ACTION: (.+)\]$/);
      if (actionMatch) {
        pendingLabel = actionMatch[1];
        continue;
      }
      if (this.cliService.parse(line)) {
        this.renderCLIBlock(this.messagesEl, line, pendingLabel);
        pendingLabel = undefined;
      } else if (line.trim() !== '') {
        pendingLabel = undefined;
      }
    }
  }

  private renderCLIBlock(container: HTMLElement, commandStr: string, label?: string): void {
    const block = container.createDiv({ cls: 'stanley-cli-block' });
    if (label) block.createDiv({ cls: 'stanley-cli-header', text: label });
    block.createEl('code', { text: commandStr, cls: 'stanley-cli-command' });

    const actionsRow = block.createDiv({ cls: 'stanley-cli-actions' });
    const runBtn = actionsRow.createEl('button', { text: 'Run', cls: 'stanley-cli-run-btn' });
    const cancelBtn = actionsRow.createEl('button', { text: 'Cancel', cls: 'stanley-cli-cancel-btn' });

    cancelBtn.addEventListener('click', () => block.remove());
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      runBtn.textContent = 'Running...';
      const cmd = this.cliService.parse(commandStr);
      if (cmd) {
        try {
          const result = await this.cliService.execute(cmd);
          actionsRow.empty();
          actionsRow.createDiv({ text: `✓ ${result}`, cls: 'stanley-cli-status-ok' });
        } catch (err) {
          actionsRow.empty();
          actionsRow.createDiv({ text: `✗ Failed — ${err instanceof Error ? err.message : String(err)}`, cls: 'stanley-cli-status-err' });
        }
      }
    });
  }

  private stripActionTags(text: string): string {
    return text.split('\n')
      .filter(line => !this.cliService.parse(line) && !/^\[ACTION: .+\]$/.test(line))
      .join('\n')
      .trim();
  }

  private appendMessage(role: 'user' | 'assistant', content: string): void {
    const bubble = this.messagesEl.createDiv({ cls: `stanley-bubble stanley-bubble-${role}` });
    bubble.textContent = content;
    this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: 'smooth' });
  }

  private appendStreamingBubble(): HTMLElement {
    const bubble = this.messagesEl.createDiv({
      cls: 'stanley-bubble stanley-bubble-assistant stanley-bubble-streaming',
    });
    this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: 'smooth' });
    return bubble;
  }
}
