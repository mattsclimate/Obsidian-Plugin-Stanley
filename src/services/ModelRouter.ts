export type ModelProvider = 'local' | 'anthropic' | 'google' | 'openai';
export type ModelRouteKind = 'none' | 'local-fast' | 'local-rag' | 'cloud-preview' | 'cloud';
export type ModelTask =
  | 'open-daily'
  | 'search'
  | 'template'
  | 'librarian-autofix'
  | 'canvas-review-card'
  | 'mempalace-log'
  | 'summarize'
  | 'deep-synthesis'
  | 'draft'
  | 'large-extraction'
  | 'reorg-plan';

export interface ModelRoutingOptions {
  cloudEnabled: boolean;
  selectedProvider: ModelProvider;
  cloudApprovedForRequest?: boolean;
  batterySaverMode?: boolean;
  cloudOnlyOnWifi?: boolean;
  wifiConnected?: boolean;
}

export interface ModelRoute {
  route: ModelRouteKind;
  provider?: ModelProvider;
  requiresPreviewApproval: boolean;
  reason?: 'cloud-disabled' | 'battery-saver' | 'wifi-required' | 'local-task' | 'approval-required';
}

export class ModelRouter {
  resolve(options: ModelRoutingOptions, task: ModelTask): ModelRoute {
    if (this.noLlmTasks.has(task)) {
      return { route: 'none', requiresPreviewApproval: false };
    }

    if (this.localFastTasks.has(task)) {
      return { route: 'local-fast', provider: 'local', requiresPreviewApproval: false, reason: 'local-task' };
    }

    if (!this.cloudUsefulFor(task)) {
      return { route: 'local-rag', provider: 'local', requiresPreviewApproval: false, reason: 'local-task' };
    }

    if (options.batterySaverMode) {
      return { route: 'local-rag', provider: 'local', requiresPreviewApproval: false, reason: 'battery-saver' };
    }

    if (options.cloudOnlyOnWifi && options.wifiConnected === false) {
      return { route: 'local-rag', provider: 'local', requiresPreviewApproval: false, reason: 'wifi-required' };
    }

    if (!options.cloudEnabled || options.selectedProvider === 'local') {
      return { route: 'local-rag', provider: 'local', requiresPreviewApproval: false, reason: 'cloud-disabled' };
    }

    if (!options.cloudApprovedForRequest) {
      return { route: 'cloud-preview', provider: options.selectedProvider, requiresPreviewApproval: true, reason: 'approval-required' };
    }

    return { route: 'cloud', provider: options.selectedProvider, requiresPreviewApproval: false };
  }

  private cloudUsefulFor(task: ModelTask): boolean {
    return ['deep-synthesis', 'draft', 'large-extraction', 'reorg-plan'].includes(task);
  }

  private noLlmTasks = new Set<ModelTask>([
    'open-daily',
    'librarian-autofix',
    'canvas-review-card',
    'mempalace-log',
  ]);

  private localFastTasks = new Set<ModelTask>(['search', 'template']);
}
