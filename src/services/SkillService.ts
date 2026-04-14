import { App, TFile, TFolder } from 'obsidian';

export interface Skill {
  id: string; // lowecased filename
  name: string; // display name
  description: string;
  path: string;
}

export class SkillService {
  private skillsPath = 'skills';

  constructor(private app: App) {}

  async listSkills(): Promise<Skill[]> {
    const folder = this.app.vault.getAbstractFileByPath(this.skillsPath);
    if (!(folder instanceof TFolder)) {
      return [];
    }

    const skills: Skill[] = [];
    const files = folder.children.filter(f => f instanceof TFile && f.extension === 'md') as TFile[];

    for (const file of files) {
      const content = await this.app.vault.read(file);
      const metadata = this.parseMetadata(content, file.basename);
      skills.push({
        id: file.basename.toLowerCase(),
        name: metadata.name || file.basename,
        description: metadata.description || 'No description provided.',
        path: file.path
      });
    }

    return skills;
  }

  async getSkillContent(id: string): Promise<string | null> {
    const skills = await this.listSkills();
    const skill = skills.find(s => s.id === id);
    if (!skill) return null;

    const file = this.app.vault.getAbstractFileByPath(skill.path);
    if (!(file instanceof TFile)) return null;

    return await this.app.vault.read(file);
  }

  private parseMetadata(content: string, defaultName: string): { name?: string; description?: string } {
    const lines = content.split('\n');
    let name: string | undefined;
    let description: string | undefined;

    for (const line of lines) {
      if (!name && line.startsWith('# ')) {
        name = line.substring(2).trim();
      }
      if (!description && (line.startsWith('## Description') || line.startsWith('🎯 Description'))) {
        // Simple heuristic: get the next non-empty line
        const index = lines.indexOf(line);
        for (let i = index + 1; i < lines.length; i++) {
          if (lines[i]?.trim()) {
            description = lines[i]!.trim();
            break;
          }
        }
      }
    }

    return { name, description };
  }
}
