import type { ChatModelProvider, CloudApiKeys, CloudModelPresets, SelectedChatModel } from '../settings';

export interface ModelCatalogSettings {
  cloudEnabled: boolean;
  cloudApiKeys: CloudApiKeys;
  cloudModelPresets?: CloudModelPresets;
}

export interface ModelOption extends SelectedChatModel {
  id: string;
  available: boolean;
  description: string;
}

export interface ModelGroup {
  label: 'Local' | 'Claude' | 'Gemini' | 'ChatGPT';
  provider: ChatModelProvider;
  models: ModelOption[];
}

const DEFAULT_CLOUD_PRESETS: CloudModelPresets = {
  anthropic: ['claude-sonnet-5', 'claude-haiku-4-5'],
  google: ['gemini-3.5-flash', 'gemini-3.1-pro'],
  openai: ['gpt-5.5', 'gpt-5.4-mini'],
};

export class ModelCatalogService {
  getModelGroups(localModels: string[], settings: ModelCatalogSettings): ModelGroup[] {
    const uniqueLocal = Array.from(new Set(localModels)).sort();

    return [
      {
        label: 'Local',
        provider: 'local',
        models: uniqueLocal.map((model) => ({
          id: `local:${model}`,
          provider: 'local',
          model,
          label: model,
          available: true,
          description: this.localDescription(model),
        })),
      },
      this.cloudGroup('Claude', 'anthropic', settings),
      this.cloudGroup('Gemini', 'google', settings),
      this.cloudGroup('ChatGPT', 'openai', settings),
    ];
  }

  modelId(model: SelectedChatModel): string {
    return `${model.provider}:${model.model}`;
  }

  private cloudGroup(label: ModelGroup['label'], provider: Exclude<ChatModelProvider, 'local'>, settings: ModelCatalogSettings): ModelGroup {
    const available = settings.cloudEnabled && settings.cloudApiKeys[provider].trim().length > 0;
    const presets = settings.cloudModelPresets?.[provider] ?? DEFAULT_CLOUD_PRESETS[provider];
    return {
      label,
      provider,
      models: presets.map((model) => ({
        id: `${provider}:${model}`,
        provider,
        model,
        label: this.cloudLabel(provider, model),
        description: this.cloudDescription(provider, model),
        available,
      })),
    };
  }

  private localDescription(model: string): string {
    if (model.includes('llama')) return 'Local general model';
    if (model.includes('mistral')) return 'Local efficient model';
    if (model.includes('phi')) return 'Local fast model';
    return 'Local Ollama model';
  }

  private cloudLabel(provider: Exclude<ChatModelProvider, 'local'>, model: string): string {
    if (provider === 'anthropic') return model.replace(/^claude-/, 'Claude ').replace(/-/g, ' ');
    if (provider === 'google') return model.replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ');
    return `ChatGPT ${model}`;
  }

  private cloudDescription(provider: Exclude<ChatModelProvider, 'local'>, model: string): string {
    if (provider === 'anthropic' && model.includes('haiku')) return 'Fast Claude cloud model';
    if (provider === 'anthropic') return 'Balanced Claude cloud model';
    if (provider === 'google' && model.includes('flash')) return 'Fast Gemini cloud model';
    if (provider === 'google') return 'Advanced Gemini cloud model';
    if (model.includes('mini')) return 'Lower-latency OpenAI model';
    return 'OpenAI cloud model';
  }
}
