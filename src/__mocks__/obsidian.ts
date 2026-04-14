export class Plugin {
  app: any;
  manifest: any;
  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }
  async loadData(): Promise<any> { return {}; }
  async saveData(_data: any): Promise<void> {}
  addRibbonIcon(_icon: string, _title: string, _cb: any): HTMLElement {
    return document.createElement('div');
  }
  addStatusBarItem(): HTMLElement { return document.createElement('div'); }
  addCommand(_cmd: any): void {}
  addSettingTab(_tab: any): void {}
  registerDomEvent(_el: any, _event: string, _cb: any): void {}
  registerInterval(_id: any): void {}
  registerEvent(_e: any): void {}
}

export class ItemView {
  app: any;
  containerEl: HTMLElement;
  leaf: any;
  constructor(leaf: any) {
    this.leaf = leaf;
    this.containerEl = document.createElement('div');
    this.app = leaf?.app ?? {};
  }
  getViewType(): string { return ''; }
  getDisplayText(): string { return ''; }
  getIcon(): string { return ''; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
  registerEvent(_e: any): void {}
}

export class MarkdownView extends ItemView {
  editor: any = {
    getSelection(): string { return ''; },
    replaceSelection(_replacement: string): void {},
  };
  getViewType(): string { return 'markdown'; }
  getDisplayText(): string { return ''; }
}

export class Editor {
  getSelection(): string { return ''; }
  replaceSelection(_replacement: string): void {}
}

export class Notice {
  constructor(_message: string, _duration?: number) {}
}

export class Modal {
  app: any;
  contentEl: HTMLElement;
  constructor(app: any) {
    this.app = app;
    this.contentEl = document.createElement('div');
  }
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: HTMLElement;
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }
  display(): void {}
  hide(): void {}
}

export class Setting {
  settingEl: HTMLElement;
  constructor(_containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
  }
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addText(cb: (text: any) => any): this {
    cb({
      setPlaceholder: () => ({ setValue: () => ({ onChange: (_fn: any) => ({}) }) }),
      setValue: (_v: string) => ({ onChange: (_fn: any) => ({}) }),
      onChange: (_fn: any) => ({}),
      inputEl: document.createElement('input'),
    });
    return this;
  }
  addToggle(cb: (toggle: any) => any): this {
    cb({ setValue: () => ({ onChange: (_fn: any) => ({}) }), onChange: (_fn: any) => ({}) });
    return this;
  }
  addSlider(cb: (slider: any) => any): this {
    const slider: any = {
      setLimits(_min: number, _max: number, _step: number) { return slider; },
      setValue(_v: number) { return slider; },
      setDynamicTooltip() { return slider; },
      setInstant(_v: boolean) { return slider; },
      onChange(_fn: (v: number) => void) { return slider; },
      sliderEl: document.createElement('input'),
    };
    cb(slider);
    return this;
  }
  addButton(cb: (btn: any) => any): this {
    cb({ setButtonText: () => ({ onClick: (_fn: any) => ({}) }), onClick: (_fn: any) => ({}) });
    return this;
  }
}

export class MarkdownRenderer {
  static async renderMarkdown(
    markdown: string,
    el: HTMLElement,
    _sourcePath: string,
    _component: any
  ): Promise<void> {
    el.innerHTML = markdown;
  }
}

export class TAbstractFile {
  path: string;
  name: string;
  parent: any;
  vault: any;
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() ?? path;
    this.parent = null;
    this.vault = null;
  }
}

export class TFile extends TAbstractFile {
  basename: string;
  extension: string;
  stat: { mtime: number; ctime: number; size: number };

  constructor(path: string, mtime = Date.now()) {
    super(path);
    this.extension = this.name.includes('.') ? this.name.split('.').pop() ?? '' : '';
    this.basename = this.name.replace(`.${this.extension}`, '');
    this.stat = { mtime, ctime: mtime, size: 100 };
  }
}

export class WorkspaceLeaf {
  view: any;
  app: any;
  constructor(app?: any) { this.app = app ?? {}; }
  getViewState(): any { return {}; }
  setViewState(_state: any): Promise<void> { return Promise.resolve(); }
}

export class Vault {
  on(_event: string, _cb: any): any { return {}; }
  getMarkdownFiles(): TFile[] { return []; }
  read(_file: TFile): Promise<string> { return Promise.resolve(''); }
  create(_path: string, _content: string): Promise<TFile> {
    return Promise.resolve(new TFile(_path));
  }
  modify(_file: TFile, _content: string): Promise<void> { return Promise.resolve(); }
}

export class Workspace {
  on(_event: string, _cb: any): any { return {}; }
  getActiveViewOfType<T>(_type: any): T | null { return null; }
  getRightLeaf(_creating: boolean): WorkspaceLeaf { return new WorkspaceLeaf(); }
  revealLeaf(_leaf: WorkspaceLeaf): void {}
  getLeavesOfType(_type: string): WorkspaceLeaf[] { return []; }
}

export class App {
  vault: Vault = new Vault();
  workspace: Workspace = new Workspace();
  metadataCache: any = {};
}

export function addIcon(_id: string, _svg: string): void {}
