export type StanleyWorkspaceMode = 'daily' | 'project' | 'research' | 'review' | 'life-artifacts';

export interface WorkspaceSuggestion {
  shouldSuggest: boolean;
  mode: StanleyWorkspaceMode;
  message: string;
}

export class WorkspaceService {
  suggestMode(path: string, currentMode: StanleyWorkspaceMode): WorkspaceSuggestion {
    const mode = this.modeForPath(path);
    return {
      shouldSuggest: mode !== currentMode,
      mode,
      message: `Open ${this.label(mode)} workspace?`,
    };
  }

  private modeForPath(path: string): StanleyWorkspaceMode {
    if (path.startsWith('Projects/') || path.startsWith('Efforts/')) return 'project';
    if (path.startsWith('Sources/') || path.startsWith('Research/')) return 'research';
    if (path.startsWith('Reviews/') || path.includes('Vault Health')) return 'review';
    if (path.startsWith('Life Artifacts/') || path.startsWith('Artifacts/')) return 'life-artifacts';
    return 'daily';
  }

  private label(mode: StanleyWorkspaceMode): string {
    if (mode === 'life-artifacts') return 'Life Artifacts';
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }
}
