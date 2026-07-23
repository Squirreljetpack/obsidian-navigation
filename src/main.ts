import { Plugin } from 'obsidian';
import { FolderNavigatorModal } from './ui/folder-navigator-modal';

export default class FolderNavigatorPlugin extends Plugin {
	async onload() {
		// Register the command that appears in the standard Obsidian Command Palette
		this.addCommand({
			id: 'open-folder-navigator',
			name: 'Open',
			callback: () => {
				new FolderNavigatorModal(this.app).open();
			},
		});
	}
}