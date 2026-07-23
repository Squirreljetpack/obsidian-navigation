import { App, PluginSettingTab, Setting } from 'obsidian';
import type FolderNavigatorPlugin from './main';

export type SortOrder = 'name' | 'atime' | 'mtime';

export interface FolderNavigatorSettings {
	defaultSort: SortOrder;
}

export const DEFAULT_SETTINGS: FolderNavigatorSettings = {
	defaultSort: 'name',
};

export class FolderNavigatorSettingTab extends PluginSettingTab {
	plugin: FolderNavigatorPlugin;

	constructor(app: App, plugin: FolderNavigatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
	}
}
