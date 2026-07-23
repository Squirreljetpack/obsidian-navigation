import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, FolderNavigatorSettingTab, FolderNavigatorSettings } from './settings';
import { FolderNavigatorModal } from './ui/folder-navigator-modal';

export default class FolderNavigatorPlugin extends Plugin {
	settings!: FolderNavigatorSettings;

	async onload() {
		await this.loadSettings();

		// Register the command that appears in the standard Obsidian Command Palette
		this.addCommand({
			id: 'open-folder-navigator',
			name: 'Open',
			callback: () => {
				const initialItem = this.app.workspace.getActiveFile() ?? this.app.vault.getRoot();
				new FolderNavigatorModal(this.app, this.settings.defaultSort, initialItem).open();
			},
		});

		this.addSettingTab(new FolderNavigatorSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<FolderNavigatorSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}