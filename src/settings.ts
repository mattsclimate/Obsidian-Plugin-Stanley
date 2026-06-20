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
  
  // Surface Go 2 / Cloud Extensions
  ecoMode: boolean;
  aiProvider: 'ollama' | 'anthropic' | 'gemini';
  anthropicApiKey: string;
  geminiApiKey: string;
  chatModelAnthropic: string;
  chatModelGemini: string;
  embeddingProvider: 'ollama' | 'gemini' | 'openai' | 'cohere';
  openaiApiKey: string;
  cohereApiKey: string;
  vectorStoreStorage: 'memory-standard' | 'memory-compressed' | 'pinecone';
  pineconeApiKey: string;
  pineconeHost: string;
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
  
  // Surface Go 2 Defaults
  ecoMode: false,
  aiProvider: 'ollama',
  anthropicApiKey: '',
  geminiApiKey: '',
  chatModelAnthropic: 'claude-3-5-haiku-latest',
  chatModelGemini: 'gemini-2.5-flash',
  embeddingProvider: 'ollama',
  openaiApiKey: '',
  cohereApiKey: '',
  vectorStoreStorage: 'memory-standard',
  pineconeApiKey: '',
  pineconeHost: '',
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

    // --- SECTION: HARDWARE PROFILE ---
    containerEl.createEl('h3', { text: 'Hardware Profile' });

    new Setting(containerEl)
      .setName('Eco / Low-Spec Hardware Mode')
      .setDesc('Throttles background tasks, compresses memory, and caps context windows to save CPU and 4GB RAM ceiling.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.ecoMode).onChange(async (value) => {
          this.plugin.settings.ecoMode = value;
          if (value) {
            // Apply aggressive limits
            this.plugin.settings.maxContextTokens = 2048;
            this.plugin.settings.chunkSize = 300;
            this.plugin.settings.chunkOverlap = 30;
            this.plugin.settings.topK = 3;
            this.plugin.settings.vectorStoreStorage = 'memory-compressed';
          } else {
            // Restore defaults
            this.plugin.settings.maxContextTokens = 4096;
            this.plugin.settings.chunkSize = 500;
            this.plugin.settings.chunkOverlap = 50;
            this.plugin.settings.topK = 5;
            this.plugin.settings.vectorStoreStorage = 'memory-standard';
          }
          await this.plugin.saveSettings();
          this.display(); // Redraw UI to reflect changed slider/input values
        })
      );

    // --- SECTION: AI PROVIDER CONFIGURATION ---
    containerEl.createEl('h3', { text: 'LLM Chat Provider' });

    new Setting(containerEl)
      .setName('Active Provider')
      .setDesc('Select the model provider for Stanley chat queries.')
      .addDropdown((drop) => {
        drop.addOption('ollama', 'Ollama (Local / Remote Network)');
        drop.addOption('anthropic', 'Anthropic Claude (Cloud)');
        drop.addOption('gemini', 'Google Gemini (Cloud)');
        drop.setValue(this.plugin.settings.aiProvider);
        drop.onChange(async (value) => {
          this.plugin.settings.aiProvider = value as any;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.aiProvider === 'ollama') {
      new Setting(containerEl)
        .setName('Ollama URL')
        .setDesc('Base URL of your local or network Ollama instance (e.g. http://192.168.1.100:11434)')
        .addText((text) =>
          text
            .setPlaceholder('http://localhost:11434')
            .setValue(this.plugin.settings.ollamaBaseUrl)
            .onChange(async (value) => {
              this.plugin.settings.ollamaBaseUrl = value;
              await this.plugin.saveSettings();
            })
        );

      const chatSetting = new Setting(containerEl)
        .setName('Chat Model')
        .setDesc('Loading models from Ollama...');

      chatSetting.addDropdown((drop) => {
        drop.addOption(this.plugin.settings.chatModel, this.plugin.settings.chatModel);
        drop.setValue(this.plugin.settings.chatModel);
        drop.onChange(async (value) => {
          this.plugin.settings.chatModel = value;
          await this.plugin.saveSettings();
        });

        this.plugin.aiProviderManager.listModels().then((models: string[]) => {
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
    }

    if (this.plugin.settings.aiProvider === 'anthropic') {
      new Setting(containerEl)
        .setName('Anthropic API Key')
        .setDesc('API key for Claude models.')
        .addText((text) =>
          text
            .setPlaceholder('sk-ant-...')
            .setValue(this.plugin.settings.anthropicApiKey)
            .onChange(async (value) => {
              this.plugin.settings.anthropicApiKey = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Claude Model')
        .setDesc('Select the Anthropic model.')
        .addDropdown((drop) => {
          drop.addOption('claude-3-5-haiku-latest', 'Claude 3.5 Haiku (Fast & Cheap)');
          drop.addOption('claude-3-5-sonnet-latest', 'Claude 3.5 Sonnet (High Capability)');
          drop.setValue(this.plugin.settings.chatModelAnthropic);
          drop.onChange(async (value) => {
            this.plugin.settings.chatModelAnthropic = value;
            await this.plugin.saveSettings();
          });
        });
    }

    if (this.plugin.settings.aiProvider === 'gemini') {
      new Setting(containerEl)
        .setName('Gemini API Key')
        .setDesc('API key for Google Gemini.')
        .addText((text) =>
          text
            .setPlaceholder('AIzaSy...')
            .setValue(this.plugin.settings.geminiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.geminiApiKey = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Gemini Model')
        .setDesc('Select the Gemini model.')
        .addDropdown((drop) => {
          drop.addOption('gemini-2.5-flash', 'Gemini 2.5 Flash (Fast, Recommended)');
          drop.addOption('gemini-2.5-pro', 'Gemini 2.5 Pro (Extremely capable)');
          drop.setValue(this.plugin.settings.chatModelGemini);
          drop.onChange(async (value) => {
            this.plugin.settings.chatModelGemini = value;
            await this.plugin.saveSettings();
          });
        });
    }

    // --- SECTION: EMBEDDINGS PROVIDER CONFIGURATION ---
    containerEl.createEl('h3', { text: 'Embedding & RAG Provider' });

    new Setting(containerEl)
      .setName('Embedding Provider')
      .setDesc('Generate vector representations of your notes locally or via cloud APIs.')
      .addDropdown((drop) => {
        drop.addOption('ollama', 'Ollama (Local)');
        drop.addOption('gemini', 'Google Gemini (Cloud)');
        drop.addOption('openai', 'OpenAI (Cloud)');
        drop.addOption('cohere', 'Cohere (Cloud)');
        drop.setValue(this.plugin.settings.embeddingProvider);
        drop.onChange(async (value) => {
          this.plugin.settings.embeddingProvider = value as any;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.embeddingProvider === 'ollama') {
      const embeddingSetting = new Setting(containerEl)
        .setName('Embedding Model')
        .setDesc('Loading models from Ollama...');

      embeddingSetting.addDropdown((drop) => {
        drop.addOption(this.plugin.settings.embeddingModel, this.plugin.settings.embeddingModel);
        drop.setValue(this.plugin.settings.embeddingModel);
        drop.onChange(async (value) => {
          this.plugin.settings.embeddingModel = value;
          await this.plugin.saveSettings();
        });

        this.plugin.aiProviderManager.listModels().then((models: string[]) => {
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
    }

    if (this.plugin.settings.embeddingProvider === 'openai') {
      new Setting(containerEl)
        .setName('OpenAI API Key')
        .setDesc('API key for generating OpenAI embeddings.')
        .addText((text) =>
          text
            .setPlaceholder('sk-proj-...')
            .setValue(this.plugin.settings.openaiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.openaiApiKey = value;
              await this.plugin.saveSettings();
            })
        );
    }

    if (this.plugin.settings.embeddingProvider === 'cohere') {
      new Setting(containerEl)
        .setName('Cohere API Key')
        .setDesc('API key for generating Cohere embeddings.')
        .addText((text) =>
          text
            .setPlaceholder('co-...')
            .setValue(this.plugin.settings.cohereApiKey)
            .onChange(async (value) => {
              this.plugin.settings.cohereApiKey = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // --- SECTION: VECTOR STORAGE CONFIGURATION ---
    containerEl.createEl('h3', { text: 'Vector Store & Indexing' });

    new Setting(containerEl)
      .setName('Vector Store Type')
      .setDesc('Standard In-Memory uses JS arrays. Compressed Float32 reduces RAM by ~50%. Pinecone offloads storage completely.')
      .addDropdown((drop) => {
        drop.addOption('memory-standard', 'Standard In-Memory');
        drop.addOption('memory-compressed', 'Compressed Float32 (Recommended for 4GB RAM)');
        drop.addOption('pinecone', 'Pinecone (Cloud Database)');
        drop.setValue(this.plugin.settings.vectorStoreStorage);
        drop.onChange(async (value) => {
          this.plugin.settings.vectorStoreStorage = value as any;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.vectorStoreStorage === 'pinecone') {
      new Setting(containerEl)
        .setName('Pinecone API Key')
        .setDesc('Your Pinecone credentials.')
        .addText((text) =>
          text
            .setPlaceholder('pcsk_...')
            .setValue(this.plugin.settings.pineconeApiKey)
            .onChange(async (value) => {
              this.plugin.settings.pineconeApiKey = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Pinecone Host URL')
        .setDesc('The index host URL from your Pinecone dashboard.')
        .addText((text) =>
          text
            .setPlaceholder('https://your-index-xxxxxx.svc.us-east1-gcp.pinecone.io')
            .setValue(this.plugin.settings.pineconeHost)
            .onChange(async (value) => {
              this.plugin.settings.pineconeHost = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // --- SECTION: FINE TUNING AND LIMITS ---
    containerEl.createEl('h3', { text: 'Parameters & Limits' });

    new Setting(containerEl)
      .setName('Chunk size')
      .setDesc(`Characters per chunk (auto-tuned: ${this.plugin.settings.chunkSize})`)
      .addSlider((slider) =>
        slider
          .setLimits(150, 1000, 50)
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
          .setLimits(2, 10, 1)
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

