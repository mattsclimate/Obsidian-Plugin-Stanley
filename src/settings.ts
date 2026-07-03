import { App, PluginSettingTab, Setting } from 'obsidian';
import type StanleyPlugin from './main';

export type ChatModelProvider = 'local' | 'anthropic' | 'google' | 'openai';

export interface SelectedChatModel {
  provider: ChatModelProvider;
  model: string;
  label: string;
}

export interface CloudApiKeys {
  anthropic: string;
  google: string;
  openai: string;
}

export interface CloudModelPresets {
  anthropic: string[];
  google: string[];
  openai: string[];
}

export interface StanleySettings {
  ollamaBaseUrl: string;
  embeddingModel: string;
  chatModel: string;
  selectedChatModel: SelectedChatModel;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  maxContextTokens: number;
  autoTuneEnabled: boolean;
  fileModTimes: Record<string, number>;
  extendedThinking: boolean;
  showStats: boolean;
  cloudEnabled: boolean;
  cloudProvider: 'openai' | 'anthropic' | 'google';
  cloudApiKeys: CloudApiKeys;
  cloudModelPresets: CloudModelPresets;
  surfaceGoMode: boolean;
  batterySaverMode: boolean;
  cloudOnlyOnWifi: boolean;
  mempalaceEnabled: boolean;
  onboardingCompleted: boolean;
  workspaceMode: 'daily' | 'project' | 'research' | 'review' | 'life-artifacts';
}

export const DEFAULT_STANLEY_SETTINGS: StanleySettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text:latest',
  chatModel: 'llama3',
  selectedChatModel: { provider: 'local', model: 'llama3', label: 'llama3' },
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 5,
  maxContextTokens: 4096,
  autoTuneEnabled: true,
  fileModTimes: {},
  extendedThinking: false,
  showStats: false,
  cloudEnabled: false,
  cloudProvider: 'anthropic',
  cloudApiKeys: { anthropic: '', google: '', openai: '' },
  cloudModelPresets: {
    anthropic: ['claude-sonnet-5', 'claude-haiku-4-5'],
    google: ['gemini-3.5-flash', 'gemini-3.1-pro'],
    openai: ['gpt-5.5', 'gpt-5.4-mini'],
  },
  surfaceGoMode: true,
  batterySaverMode: false,
  cloudOnlyOnWifi: true,
  mempalaceEnabled: true,
  onboardingCompleted: false,
  workspaceMode: 'daily',
};

export class StanleySettingTab extends PluginSettingTab {
  plugin: StanleyPlugin;

  constructor(app: App, plugin: StanleyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Stanley Settings' });

    new Setting(containerEl)
      .setName('Ollama URL')
      .setDesc('Base URL of your local Ollama instance')
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.ollamaBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaBaseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    const embeddingSetting = new Setting(containerEl)
      .setName('Embedding model')
      .setDesc('Loading models from Ollama...');

    embeddingSetting.addDropdown((drop) => {
      drop.addOption(this.plugin.settings.embeddingModel, this.plugin.settings.embeddingModel);
      drop.setValue(this.plugin.settings.embeddingModel);
      drop.onChange(async (value) => {
        this.plugin.settings.embeddingModel = value;
        this.plugin.ollamaClient.embeddingModel = value;
        await this.plugin.saveSettings();
      });

      this.plugin.ollamaClient.listModels().then((models) => {
        drop.selectEl.innerHTML = '';
        for (const m of models) drop.addOption(m, m);
        if (!models.includes(this.plugin.settings.embeddingModel)) {
          drop.addOption(
            this.plugin.settings.embeddingModel,
            `${this.plugin.settings.embeddingModel} (not installed)`
          );
        }
        drop.setValue(this.plugin.settings.embeddingModel);
        embeddingSetting.setDesc('Model used for generating note embeddings');
      }).catch(() => {
        embeddingSetting.setDesc('⚠ Could not reach Ollama — check URL above');
      });
    });

    const chatSetting = new Setting(containerEl)
      .setName('Chat model')
      .setDesc('Loading models from Ollama...');

    chatSetting.addDropdown((drop) => {
      drop.addOption(this.plugin.settings.chatModel, this.plugin.settings.chatModel);
      drop.setValue(this.plugin.settings.chatModel);
      drop.onChange(async (value) => {
        this.plugin.settings.chatModel = value;
        this.plugin.ollamaClient.chatModel = value;
        await this.plugin.saveSettings();
      });

      this.plugin.ollamaClient.listModels().then((models) => {
        drop.selectEl.innerHTML = '';
        for (const m of models) drop.addOption(m, m);
        if (!models.includes(this.plugin.settings.chatModel)) {
          drop.addOption(
            this.plugin.settings.chatModel,
            `${this.plugin.settings.chatModel} (not installed)`
          );
        }
        drop.setValue(this.plugin.settings.chatModel);
        chatSetting.setDesc('Model used for chat responses');
      }).catch(() => {
        chatSetting.setDesc('⚠ Could not reach Ollama — check URL above');
      });
    });

    new Setting(containerEl)
      .setName('Chunk size')
      .setDesc(`Characters per chunk (auto-tuned: ${this.plugin.settings.chunkSize})`)
      .addSlider((slider) =>
        slider
          .setLimits(200, 1000, 50)
          .setValue(this.plugin.settings.chunkSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.chunkSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Chunk overlap')
      .setDesc(`Character overlap between chunks (auto-tuned: ${this.plugin.settings.chunkOverlap})`)
      .addSlider((slider) =>
        slider
          .setLimits(0, 150, 10)
          .setValue(this.plugin.settings.chunkOverlap)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.chunkOverlap = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Top-K retrieval')
      .setDesc(`Number of chunks to retrieve per query (auto-tuned: ${this.plugin.settings.topK})`)
      .addSlider((slider) =>
        slider
          .setLimits(3, 10, 1)
          .setValue(this.plugin.settings.topK)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.topK = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Max context tokens')
      .setDesc('Maximum tokens to include in each chat prompt')
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxContextTokens))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxContextTokens = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Auto-tune')
      .setDesc('Automatically adjust chunk size and top-K based on observed performance')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoTuneEnabled).onChange(async (value) => {
          this.plugin.settings.autoTuneEnabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Cloud models')
      .setDesc('Off by default. When enabled, Stanley still asks before sending selected vault context.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.cloudEnabled).onChange(async (value) => {
          this.plugin.settings.cloudEnabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Cloud provider')
      .setDesc('Used only after cloud models are enabled and a per-request context preview is approved')
      .addDropdown((drop) =>
        drop
          .addOption('anthropic', 'Anthropic')
          .addOption('google', 'Google Gemini')
          .addOption('openai', 'OpenAI')
          .setValue(this.plugin.settings.cloudProvider)
          .onChange(async (value: 'openai' | 'anthropic' | 'google') => {
            this.plugin.settings.cloudProvider = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Anthropic API key')
      .setDesc('Stored locally in Obsidian plugin data for v1')
      .addText((text) =>
        text
          .setPlaceholder('sk-ant-...')
          .setValue(this.plugin.settings.cloudApiKeys.anthropic)
          .onChange(async (value) => {
            this.plugin.settings.cloudApiKeys.anthropic = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Gemini API key')
      .setDesc('Stored locally in Obsidian plugin data for v1')
      .addText((text) =>
        text
          .setPlaceholder('Google AI Studio key')
          .setValue(this.plugin.settings.cloudApiKeys.google)
          .onChange(async (value) => {
            this.plugin.settings.cloudApiKeys.google = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('OpenAI API key')
      .setDesc('Stored locally in Obsidian plugin data for v1')
      .addText((text) =>
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.cloudApiKeys.openai)
          .onChange(async (value) => {
            this.plugin.settings.cloudApiKeys.openai = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Claude model IDs')
      .setDesc('Comma-separated editable cloud presets')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.cloudModelPresets.anthropic.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.cloudModelPresets.anthropic = this.parsePresetList(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Gemini model IDs')
      .setDesc('Comma-separated editable cloud presets')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.cloudModelPresets.google.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.cloudModelPresets.google = this.parsePresetList(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('OpenAI model IDs')
      .setDesc('Comma-separated editable cloud presets')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.cloudModelPresets.openai.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.cloudModelPresets.openai = this.parsePresetList(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Surface Go mode')
      .setDesc('Prefer local and deterministic paths for low-resource hardware')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.surfaceGoMode).onChange(async (value) => {
          this.plugin.settings.surfaceGoMode = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Battery saver mode')
      .setDesc('Keep heavy requests local/offline even when cloud is configured')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.batterySaverMode).onChange(async (value) => {
          this.plugin.settings.batterySaverMode = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Cloud only on Wi-Fi')
      .setDesc('Block cloud routing when Stanley is told Wi-Fi is unavailable')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.cloudOnlyOnWifi).onChange(async (value) => {
          this.plugin.settings.cloudOnlyOnWifi = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('MemPalace Lite')
      .setDesc('Inject compact episodic memory into chat context')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mempalaceEnabled).onChange(async (value) => {
          this.plugin.settings.mempalaceEnabled = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private parsePresetList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
