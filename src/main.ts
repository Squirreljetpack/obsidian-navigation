import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, FolderNavigatorSettingTab, FolderNavigatorSettings } from './settings';
import { FolderNavigatorModal } from './ui/folder-navigator-modal';

import { disableZenAndToggleSidebars } from './commands/zen-sidebar';

export default class FolderNavigatorPlugin extends Plugin {
	settings!: FolderNavigatorSettings;

	async onload() {
		await this.loadSettings();

		// Register the command that appears in the standard Obsidian Command Palette
		const openModal = () => {
			const initialItem = this.app.workspace.getActiveFile() ?? this.app.vault.getRoot();
			new FolderNavigatorModal(this.app, this.settings, initialItem).open();
		};

		this.addCommand({
			id: 'open-folder-navigator',
			name: 'Open navigator',
			callback: openModal,
		});

		this.addCommand({
			id: 'open-navigator',
			name: 'Open navigator',
			callback: openModal,
		});

		this.addCommand({
			id: 'toggle-sidebars',
			name: 'Toggle sidebars',
			callback: () => {
				disableZenAndToggleSidebars(this.app);
			},
		});

		this.addSettingTab(new FolderNavigatorSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<FolderNavigatorSettings>);
		if (!this.settings.customCommands) {
			this.settings.customCommands = [];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}