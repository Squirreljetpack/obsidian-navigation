import { App, PluginSettingTab, Setting } from 'obsidian';
import type FolderNavigatorPlugin from './main';

export type SortOrder = 'name' | 'atime' | 'mtime';

export interface FolderNavigatorSettings {
	defaultSort: SortOrder;
	openWithProgram: string;
	openWithProgramAlt: string;
}

export const DEFAULT_SETTINGS: FolderNavigatorSettings = {
	defaultSort: 'name',
	openWithProgram: '',
	openWithProgramAlt: '',
};

export class FolderNavigatorSettingTab extends PluginSettingTab {
	plugin: FolderNavigatorPlugin;

	constructor(app: App, plugin: FolderNavigatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions() {
		return [];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Default sort order')
			.setDesc('Select the default sort order for files and folders in the navigator modal.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('name', 'Name (alphabetical)')
					.addOption('atime', 'Accessed / created time')
					.addOption('mtime', 'Modified time')
					.setValue(this.plugin.settings.defaultSort)
					.onChange(async (value: string) => {
						this.plugin.settings.defaultSort = value as SortOrder;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Open with program')
			.setDesc('Executable command used to open files externally (e.g. Code, code -r, subl). Triggered in navigator with mod + ↓ when configured.')
			.addText((text) =>
				text
					.setPlaceholder('Code')
					.setValue(this.plugin.settings.openWithProgram)
					.onChange(async (value: string) => {
						this.plugin.settings.openWithProgram = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Alternate open with program')
			.setDesc('Alternate executable command used to open files externally. Triggered in navigator with mod + shift + ↓ when configured.')
			.addText((text) =>
				text
					.setPlaceholder('Cursor')
					.setValue(this.plugin.settings.openWithProgramAlt)
					.onChange(async (value: string) => {
						this.plugin.settings.openWithProgramAlt = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
