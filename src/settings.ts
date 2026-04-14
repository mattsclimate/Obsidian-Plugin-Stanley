import { App, PluginSettingTab, Setting } from 'obsidian';
import type StanleyPlugin from './main';

export interface StanleySettings {
  ollamaBaseUrl: string;
  embeddingModel: string;
  chatModel: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  maxContextTokens: number;
  autoTuneEnabled: boolean;
  fileModTimes: Record<string, number>;
  extendedThinking: boolean;
  showStats: boolean;
}

export const DEFAULT_STANLEY_SETTINGS: StanleySettings = {
  ollamaBaseUrl: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text:latest',
  chatModel: 'llama3',
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 5,
  maxContextTokens: 4096,
  autoTuneEnabled: true,
  fileModTimes: {},
  extendedThinking: false,
  showStats: false,
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
  }
}
