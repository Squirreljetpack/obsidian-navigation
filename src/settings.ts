import { App, PluginSettingTab, Setting } from 'obsidian';
import type FolderNavigatorPlugin from './main';

export type SortOrder = 'name' | 'atime' | 'mtime';

export interface CustomHotkeyCommand {
	id: string;
	hotkey: string;
	command: string;
}

export interface FolderNavigatorSettings {
	defaultSort: SortOrder;
	macosPath: string;
	windowsPath: string;
	linuxPath: string;
	customCommands: CustomHotkeyCommand[];
}

export const DEFAULT_SETTINGS: FolderNavigatorSettings = {
	defaultSort: 'name',
	macosPath: '/usr/local/bin:/opt/homebrew/bin:~/.local/bin',
	windowsPath: '',
	linuxPath: '/usr/local/bin:~/.local/bin',
	customCommands: [],
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
			.setName('macOS path additions')
			.setDesc('Colon-separated directory paths appended to path on macOS (e.g. /usr/local/bin:/opt/homebrew/bin).')
			.addText((text) =>
				text
					.setPlaceholder('/opt/homebrew/bin')
					.setValue(this.plugin.settings.macosPath)
					.onChange(async (value: string) => {
						this.plugin.settings.macosPath = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Windows path additions')
			.setDesc('Semicolon-separated directory paths appended to path on Windows.')
			.addText((text) =>
				text
					.setPlaceholder('C:\\program files')
					.setValue(this.plugin.settings.windowsPath)
					.onChange(async (value: string) => {
						this.plugin.settings.windowsPath = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Linux path additions')
			.setDesc('Colon-separated directory paths appended to path on Linux (e.g. /usr/local/bin:~/.local/bin).')
			.addText((text) =>
				text
					.setPlaceholder('/usr/local/bin')
					.setValue(this.plugin.settings.linuxPath)
					.onChange(async (value: string) => {
						this.plugin.settings.linuxPath = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Custom hotkey commands')
			.setDesc('Define hotkey mappings and program command templates. Use {} for the target file or folder path.')
			.addButton((button) =>
				button
					.setButtonText('Add hotkey command')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.customCommands.push({
							id: Date.now().toString(),
							hotkey: '',
							command: '',
						});
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		this.plugin.settings.customCommands.forEach((cmdItem, index) => {
			const setting = new Setting(containerEl)
				.addText((text) =>
					text
						.setPlaceholder('Mod+down')
						.setValue(cmdItem.hotkey)
						.onChange(async (val) => {
							cmdItem.hotkey = val;
							await this.plugin.saveSettings();
						}),
				)
				.addText((text) =>
					text
						.setPlaceholder('Code {}')
						.setValue(cmdItem.command)
						.onChange(async (val) => {
							cmdItem.command = val;
							await this.plugin.saveSettings();
						}),
				)
				.addButton((button) =>
					button
						.setButtonText('Delete')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.customCommands.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						}),
				);

			setting.infoEl.remove();
		});
	}
}
