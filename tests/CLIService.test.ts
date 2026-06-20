import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLIService } from '../src/services/CLIService';
import { VaultService } from '../src/services/VaultService';
import { TFile, App } from 'obsidian';

describe('CLIService & VaultService surgical operations', () => {
  let mockApp: App;
  let vaultService: VaultService;
  let cliService: CLIService;

  beforeEach(() => {
    mockApp = new App();
    vi.spyOn(mockApp.vault, 'read').mockResolvedValue('existing content');
    vi.spyOn(mockApp.vault, 'append').mockResolvedValue(undefined);
    vi.spyOn(mockApp.vault, 'modify').mockResolvedValue(undefined);
    
    // Mock processFrontMatter
    mockApp.fileManager = {
      processFrontMatter: vi.fn().mockImplementation(async (file, callback) => {
        const fm = {};
        callback(fm);
      }),
    } as any;

    vaultService = new VaultService(mockApp);
    cliService = new CLIService(mockApp, vaultService);
  });

  describe('VaultService surgical writes', () => {
    it('appendLink appends a wikilink to the bottom of the file', async () => {
      const file = new TFile('wiki/topic.md');
      await vaultService.appendLink(file, 'wiki/other-topic.md');

      expect(mockApp.vault.append).toHaveBeenCalledWith(file, '\n\nSee also: [[wiki/other-topic]]');
    });

    it('updateFrontmatter delegates to fileManager.processFrontMatter', async () => {
      const file = new TFile('wiki/topic.md');
      await vaultService.updateFrontmatter(file, 'status', 'completed');

      expect(mockApp.fileManager.processFrontMatter).toHaveBeenCalledWith(file, expect.any(Function));
    });
  });

  describe('CLIService commands', () => {
    it('parses and executes append_link command', async () => {
      const file = new TFile('wiki/topic.md');
      vi.spyOn(mockApp.vault, 'getAbstractFileByPath').mockReturnValue(file);
      vi.spyOn(vaultService, 'appendLink').mockResolvedValue(undefined);

      const commandStr = 'obsidian append_link file="wiki/topic.md" target="wiki/other.md"';
      const parsed = cliService.parse(commandStr);
      expect(parsed).not.toBeNull();
      expect(parsed!.command).toBe('append_link');
      expect(parsed!.args.file).toBe('wiki/topic.md');
      expect(parsed!.args.target).toBe('wiki/other.md');

      const result = await cliService.execute(parsed!);
      expect(vaultService.appendLink).toHaveBeenCalledWith(file, 'wiki/other.md');
      expect(result).toBe('Appended link to [[wiki/other.md]] in wiki/topic.md');
    });

    it('parses and executes property:set command using VaultService', async () => {
      const file = new TFile('wiki/topic.md');
      vi.spyOn(mockApp.vault, 'getAbstractFileByPath').mockReturnValue(file);
      vi.spyOn(vaultService, 'updateFrontmatter').mockResolvedValue(undefined);

      const commandStr = 'obsidian property:set name="status" value="completed" file="wiki/topic.md"';
      const parsed = cliService.parse(commandStr);
      expect(parsed).not.toBeNull();
      expect(parsed!.command).toBe('property:set');

      const result = await cliService.execute(parsed!);
      expect(vaultService.updateFrontmatter).toHaveBeenCalledWith(file, 'status', 'completed');
      expect(result).toBe('Set property "status" to "completed" in wiki/topic.md');
    });
  });
});
