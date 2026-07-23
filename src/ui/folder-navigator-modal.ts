import { App, SuggestModal, TAbstractFile, TFile, TFolder } from 'obsidian';

interface SuggestChooser {
	values?: Array<{ item: TAbstractFile }>;
	setSelectedItem(index: number): void;
}

export class FolderNavigatorModal extends SuggestModal<TAbstractFile> {
	currentFolder: TFolder;
	activeFile: TFile | null;

	constructor(app: App, startFolder?: TFolder) {
		super(app);

		this.activeFile = this.app.workspace.getActiveFile();

		// If a specific folder is passed (used when navigating), use it.
		// Otherwise, default to the active file's parent, or the vault root.
		if (startFolder) {
			this.currentFolder = startFolder;
		} else {
			this.currentFolder = this.activeFile && this.activeFile.parent
				? this.activeFile.parent
				: this.app.vault.getRoot();
		}

		// Add visual cues at the bottom of the modal
		this.setInstructions([
			{ command: '↑↓', purpose: 'Navigate' },
			{ command: '↵', purpose: 'Open file / Enter folder' },
			{ command: 'Ctrl/Cmd + ↑', purpose: 'Go to parent folder' },
			{ command: 'Esc', purpose: 'Dismiss' },
		]);

		// Register custom hotkey for navigating UP to the parent folder
		this.scope.register(['Mod'], 'ArrowUp', (evt) => {
			evt.preventDefault();
			if (this.currentFolder.parent) {
				this.close(); // Close current modal
				// Open a new modal instance rooted in the parent folder
				new FolderNavigatorModal(this.app, this.currentFolder.parent).open();
			}
		});
	}

	onOpen() {
		void super.onOpen();

		// Use a short timeout to wait for the UI to populate its initial suggestions.
		// We use the undocumented `chooser` API to set the highlighted item.
		window.setTimeout(() => {
			// Don't hijack the cursor if the user has already started typing
			if (this.inputEl.value !== '') return;

			const chooser = (this as unknown as { chooser?: SuggestChooser }).chooser;
			if (chooser?.values) {
				// Find the index of the currently active file in the generated suggestions
				const index = chooser.values.findIndex((v) => v.item === this.activeFile);
				if (index !== -1) {
					chooser.setSelectedItem(index);
				}
			}
		}, 50);
	}

	getSuggestions(query: string): TAbstractFile[] {
		// Filter the current folder's children based on search input
		const children = this.currentFolder.children.filter((f) =>
			f.name.toLowerCase().includes(query.toLowerCase()),
		);

		// Sort the array: Folders at the top, then alphabetically
		return children.sort((a, b) => {
			if (a instanceof TFolder && b instanceof TFile) return -1;
			if (a instanceof TFile && b instanceof TFolder) return 1;
			return a.name.localeCompare(b.name);
		});
	}

	renderSuggestion(file: TAbstractFile, el: HTMLElement) {
		el.addClass('folder-navigator-item');

		const iconEl = el.createSpan({ cls: 'folder-navigator-icon' });
		el.createSpan({ text: file.name, cls: 'folder-navigator-name' });

		if (file instanceof TFolder) {
			iconEl.setText('📁');
			el.addClass('is-folder');
		} else {
			iconEl.setText('📄');
			el.addClass('is-file');
		}
	}

	onChooseSuggestion(item: TAbstractFile, _evt: MouseEvent | KeyboardEvent) {
		if (item instanceof TFile) {
			// It's a file: open it in the current active leaf
			void this.app.workspace.getLeaf(false).openFile(item);
		} else if (item instanceof TFolder) {
			// It's a folder: the modal natively closes upon making a selection,
			// so we instantiate a fresh modal targeting the new directory.
			new FolderNavigatorModal(this.app, item).open();
		}
	}
}
