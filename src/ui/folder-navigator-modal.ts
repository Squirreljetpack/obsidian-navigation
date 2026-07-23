import { App, Keymap, SuggestModal, TAbstractFile, TFile, TFolder, WorkspaceLeaf, setIcon } from 'obsidian';
import { SortOrder } from '../settings';

interface SuggestChooser {
	values?: TAbstractFile[];
	selectedItem: number;
	setSelectedItem(index: number, evt?: MouseEvent | KeyboardEvent): void;
	scrollSelectedItemIntoView?(): void;
	updateSuggestions?(): void;
}

export class FolderNavigatorModal extends SuggestModal<TAbstractFile> {
	currentFolder: TFolder;
	activeFile: TFile | null;
	currentSort: SortOrder;

	constructor(app: App, defaultSort: SortOrder = 'name', startFolder?: TFolder) {
		super(app);

		this.activeFile = this.app.workspace.getActiveFile();
		this.currentSort = defaultSort;

		// If a specific folder is passed (used when navigating), use it.
		// Otherwise, default to the active file's parent, or the vault root.
		if (startFolder) {
			this.currentFolder = startFolder;
		} else {
			this.currentFolder = this.activeFile && this.activeFile.parent
				? this.activeFile.parent
				: this.app.vault.getRoot();
		}

		this.updateInstructions();

		// Register custom hotkey for navigating UP to the parent folder
		this.scope.register(['Mod'], 'ArrowUp', (evt) => {
			evt.preventDefault();
			if (this.currentFolder.parent) {
				this.close(); // Close current modal
				// Open a new modal instance rooted in the parent folder
				new FolderNavigatorModal(this.app, this.currentSort, this.currentFolder.parent).open();
			}
		});

		// Register custom hotkey for opening in horizontal split (Mod + -)
		this.scope.register(['Mod'], '-', (evt) => {
			evt.preventDefault();
			this.openSelectedItem('horizontal');
		});

		// Register custom hotkey for opening in vertical split (Mod + I)
		this.scope.register(['Mod'], 'i', (evt) => {
			evt.preventDefault();
			this.openSelectedItem('vertical');
		});

		// Register custom hotkey for cycling sort order (Mod + S)
		this.scope.register(['Mod'], 's', (evt) => {
			evt.preventDefault();
			this.cycleSort();
		});
	}

	private updateInstructions() {
		this.setInstructions([
			{ command: '↑↓', purpose: 'Navigate' },
			{ command: '↵', purpose: 'Open' },
			{ command: 'Mod + ↵', purpose: 'Open in new tab' },
			{ command: 'Mod + -', purpose: 'Horizontal pane' },
			{ command: 'Mod + I', purpose: 'Vertical pane' },
			{ command: 'Mod + S', purpose: `cycle sort (current: ${this.currentSort})` },
			{ command: 'Mod + ↑', purpose: 'Parent folder' },
			{ command: 'Esc', purpose: 'Dismiss' },
		]);
	}

	private cycleSort() {
		if (this.currentSort === 'name') {
			this.currentSort = 'atime';
		} else if (this.currentSort === 'atime') {
			this.currentSort = 'mtime';
		} else {
			this.currentSort = 'name';
		}

		this.updateInstructions();

		const chooser = (this as unknown as { chooser?: SuggestChooser }).chooser;
		if (chooser && typeof chooser.updateSuggestions === 'function') {
			chooser.updateSuggestions();
		}
	}

	private getHighlightedItem(): TAbstractFile | null {
		const chooser = (this as unknown as { chooser?: SuggestChooser }).chooser;
		if (chooser?.values && typeof chooser.selectedItem === 'number') {
			return chooser.values[chooser.selectedItem] ?? null;
		}
		return null;
	}

	private openSelectedItem(mode: 'tab' | 'horizontal' | 'vertical') {
		const item = this.getHighlightedItem();
		if (!item) return;

		this.close();
		if (item instanceof TFile) {
			let leaf: WorkspaceLeaf;
			if (mode === 'tab') {
				leaf = this.app.workspace.getLeaf('tab');
			} else if (mode === 'horizontal') {
				leaf = this.app.workspace.getLeaf('split', 'horizontal');
			} else if (mode === 'vertical') {
				leaf = this.app.workspace.getLeaf('split', 'vertical');
			} else {
				leaf = this.app.workspace.getLeaf(false);
			}
			void leaf.openFile(item);
		} else if (item instanceof TFolder) {
			new FolderNavigatorModal(this.app, this.currentSort, item).open();
		}
	}

	private setInitialSelectedItem() {
		if (this.inputEl.value !== '') return;
		if (!this.activeFile) return;

		const chooser = (this as unknown as { chooser?: SuggestChooser }).chooser;
		if (chooser?.values && Array.isArray(chooser.values)) {
			const activePath = this.activeFile.path;
			const index = chooser.values.findIndex((v) => v?.path === activePath);
			if (index !== -1) {
				chooser.setSelectedItem(index);
				if (typeof chooser.scrollSelectedItemIntoView === 'function') {
					chooser.scrollSelectedItemIntoView();
				}
			}
		}
	}

	onOpen() {
		void super.onOpen();
		this.setInitialSelectedItem();
	}

	getSuggestions(query: string): TAbstractFile[] {
		// Filter the current folder's children based on search input
		const children = this.currentFolder.children.filter((f) =>
			f.name.toLowerCase().includes(query.toLowerCase()),
		);

		// Sort the array: Folders at top, then sort by currentSort key
		return children.sort((a, b) => {
			if (a instanceof TFolder && b instanceof TFile) return -1;
			if (a instanceof TFile && b instanceof TFolder) return 1;

			if (this.currentSort === 'mtime') {
				const aMtime = a instanceof TFile ? a.stat.mtime : 0;
				const bMtime = b instanceof TFile ? b.stat.mtime : 0;
				if (bMtime !== aMtime) return bMtime - aMtime;
			} else if (this.currentSort === 'atime') {
				const aAtime = a instanceof TFile ? ((a.stat as { atime?: number }).atime || a.stat.ctime) : 0;
				const bAtime = b instanceof TFile ? ((b.stat as { atime?: number }).atime || b.stat.ctime) : 0;
				if (bAtime !== aAtime) return bAtime - aAtime;
			}

			return a.name.localeCompare(b.name);
		});
	}

	renderSuggestion(file: TAbstractFile, el: HTMLElement) {
		el.addClass('folder-navigator-item');

		const iconEl = el.createSpan({ cls: 'folder-navigator-icon' });
		el.createSpan({ text: file.name, cls: 'folder-navigator-name' });

		if (file instanceof TFolder) {
			setIcon(iconEl, 'folder');
			el.addClass('is-folder');
		} else {
			setIcon(iconEl, 'file-text');
			el.addClass('is-file');
		}
	}

	onChooseSuggestion(item: TAbstractFile, evt: MouseEvent | KeyboardEvent) {
		if (item instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(evt));
			void leaf.openFile(item);
		} else if (item instanceof TFolder) {
			// It's a folder: the modal natively closes upon making a selection,
			// so we instantiate a fresh modal targeting the new directory.
			new FolderNavigatorModal(this.app, this.currentSort, item).open();
		}
	}
}
