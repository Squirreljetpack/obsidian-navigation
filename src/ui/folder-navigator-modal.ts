import { App, Keymap, SuggestModal, TAbstractFile, TFile, TFolder, WorkspaceLeaf, setIcon } from 'obsidian';
import { FolderNavigatorSettings, SortOrder } from '../settings';
import { openWithExternalProgram, revealInSystemExplorer } from '../utils/system';

// Augment Obsidian's internal type definitions directly
declare module 'obsidian' {
    interface SuggestModal<T> {
        chooser?: {
            values?: T[];
            selectedItem: number;
            setSelectedItem(index: number, evt?: MouseEvent | KeyboardEvent): void;
            updateSuggestions?(): void;
        };
    }
}

export class FolderNavigatorModal extends SuggestModal<TAbstractFile> {
    currentFolder: TFolder;
    initialTarget: TAbstractFile | null;
    settings: FolderNavigatorSettings;
    currentSort: SortOrder;

    constructor(
        app: App,
        settings: FolderNavigatorSettings,
        initialItem: TAbstractFile,
        initialSort?: SortOrder,
    ) {
        super(app);

        this.settings = settings;
        this.currentSort = initialSort ?? settings.defaultSort;

        if (initialItem instanceof TFolder) {
            this.currentFolder = initialItem;
            this.initialTarget = null;
        } else {
            this.currentFolder = initialItem.parent ?? this.app.vault.getRoot();
            this.initialTarget = initialItem;
        }

        this.updateInstructions();
        this.registerKeybindings();
    }

    private registerKeybindings(): void {
        // Navigate to parent folder in-place (Mod + Left)
        this.scope.register(['Mod'], 'ArrowLeft', (evt) => {
            evt.preventDefault();
            if (this.currentFolder.parent) {
                this.navigateToFolder(this.currentFolder.parent, this.currentFolder);
            }
        });

        // Reveal in system explorer (Mod + Up)
        this.scope.register(['Mod'], 'ArrowUp', (evt) => {
            evt.preventDefault();
            const target = this.getHighlightedItem() ?? this.currentFolder;
            if (target) {
                revealInSystemExplorer(this.app, target);
            }
        });

        // Open with primary program (Mod + Down) - only if configured
        const primaryProgram = this.settings.openWithProgram.trim();
        if (primaryProgram) {
            this.scope.register(['Mod'], 'ArrowDown', (evt) => {
                evt.preventDefault();
                const target = this.getHighlightedItem() ?? this.currentFolder;
                if (target) {
                    this.close();
                    openWithExternalProgram(this.app, target, primaryProgram);
                }
            });
        }

        // Open with alternate program (Mod + Shift + Down) - only if configured
        const altProgram = this.settings.openWithProgramAlt.trim();
        if (altProgram) {
            this.scope.register(['Mod', 'Shift'], 'ArrowDown', (evt) => {
                evt.preventDefault();
                const target = this.getHighlightedItem() ?? this.currentFolder;
                if (target) {
                    this.close();
                    openWithExternalProgram(this.app, target, altProgram);
                }
            });
        }

        // Open in horizontal split (Mod + -)
        this.scope.register(['Mod'], '-', (evt) => {
            evt.preventDefault();
            this.openSelectedItem('horizontal');
        });

        // Open in vertical split (Mod + I)
        this.scope.register(['Mod'], 'i', (evt) => {
            evt.preventDefault();
            this.openSelectedItem('vertical');
        });

        // Cycle sort mode (Mod + S)
        this.scope.register(['Mod'], 's', (evt) => {
            evt.preventDefault();
            this.cycleSort();
        });
    }

    private updateInstructions(): void {
        const instructions = [
            { command: '↑↓', purpose: 'Navigate' },
            { command: '↵', purpose: 'Open' },
            { command: 'Mod + ↵', purpose: 'Open in new tab' },
            { command: 'Mod + -', purpose: 'Horizontal pane' },
            { command: 'Mod + I', purpose: 'Vertical pane' },
            { command: 'Mod + S', purpose: `Cycle sort (${this.currentSort})` },
            { command: 'Mod + ←', purpose: 'Parent folder' },
            { command: 'Mod + ↑', purpose: 'Reveal in Finder' },
        ];

        const primaryProgram = this.settings.openWithProgram.trim();
        if (primaryProgram) {
            instructions.push({ command: 'Mod + ↓', purpose: `Open with ${primaryProgram}` });
        }

        const altProgram = this.settings.openWithProgramAlt.trim();
        if (altProgram) {
            instructions.push({ command: 'Mod + Shift + ↓', purpose: `Open with ${altProgram}` });
        }

        instructions.push({ command: 'Esc', purpose: 'Dismiss' });

        this.setInstructions(instructions);
    }

    private cycleSort(): void {
        const nextSortMode: Record<SortOrder, SortOrder> = {
            name: 'atime',
            atime: 'mtime',
            mtime: 'name',
        };

        this.currentSort = nextSortMode[this.currentSort] ?? 'name';
        this.updateInstructions();

        const currentlyHighlighted = this.getHighlightedItem();
        if (currentlyHighlighted) {
            this.initialTarget = currentlyHighlighted;
        }

        this.refreshSuggestions();
        this.restoreCursorToTarget();
    }

    private navigateToFolder(newFolder: TFolder, newTarget: TAbstractFile | null = null): void {
        this.currentFolder = newFolder;
        this.initialTarget = newTarget;
        this.inputEl.value = ''; // Clear search filter on navigation

        this.refreshSuggestions();
        this.restoreCursorToTarget();
    }

    private refreshSuggestions(): void {
        if (this.chooser?.updateSuggestions) {
            this.chooser.updateSuggestions();
        } else {
            this.inputEl.dispatchEvent(new Event('input'));
        }
    }

    private getHighlightedItem(): TAbstractFile | null {
        if (this.chooser?.values && typeof this.chooser.selectedItem === 'number') {
            return this.chooser.values[this.chooser.selectedItem] ?? null;
        }
        return null;
    }

    private openSelectedItem(mode: 'tab' | 'horizontal' | 'vertical'): void {
        const item = this.getHighlightedItem();
        if (!item) return;

        this.close();
        if (item instanceof TFile) {
            let leaf: WorkspaceLeaf;
            if (mode === 'tab') {
                leaf = this.app.workspace.getLeaf('tab');
            } else {
                leaf = this.app.workspace.getLeaf('split', mode);
            }
            void leaf.openFile(item);
        } else if (item instanceof TFolder) {
            new FolderNavigatorModal(this.app, this.settings, item, this.currentSort).open();
        }
    }

    private restoreCursorToTarget(): void {
        if (!this.initialTarget) return;

        if (this.chooser?.values) {
            const targetPath = this.initialTarget.path;
            const index = this.chooser.values.findIndex((v) => v?.path === targetPath);

            if (index !== -1) {
                this.chooser.setSelectedItem(index);
            }
        }
    }

    onOpen(): void {
        void super.onOpen();
        if (!this.inputEl.value) {
            this.restoreCursorToTarget();
        }
    }

    getSuggestions(query: string): TAbstractFile[] {
        const lowerQuery = query.toLowerCase();
        const children = this.currentFolder.children.filter((f) =>
            f.name.toLowerCase().includes(lowerQuery),
        );

        return children.sort((a, b) => {
            // Priority: Folders first
            if (a instanceof TFolder && b instanceof TFile) return -1;
            if (a instanceof TFile && b instanceof TFolder) return 1;

            // Secondary: Apply selected sort field
            if (this.currentSort === 'mtime') {
                const aMtime = a instanceof TFile ? a.stat.mtime : 0;
                const bMtime = b instanceof TFile ? b.stat.mtime : 0;
                if (bMtime !== aMtime) return bMtime - aMtime;
            } else if (this.currentSort === 'atime') {
                const aAtime = a instanceof TFile ? ((a.stat as { atime?: number }).atime ?? a.stat.ctime) : 0;
                const bAtime = b instanceof TFile ? ((b.stat as { atime?: number }).atime ?? b.stat.ctime) : 0;
                if (bAtime !== aAtime) return bAtime - aAtime;
            }

            // Fallback: Alphabetical
            return a.name.localeCompare(b.name);
        });
    }

    renderSuggestion(file: TAbstractFile, el: HTMLElement): void {
        el.addClass('folder-navigator-item');

        const isFolder = file instanceof TFolder;
        const iconEl = el.createSpan({ cls: 'folder-navigator-icon' });

        el.createSpan({ text: file.name, cls: 'folder-navigator-name' });
        el.addClass(isFolder ? 'is-folder' : 'is-file');

        setIcon(iconEl, isFolder ? 'folder' : 'file-text');
    }

    onChooseSuggestion(item: TAbstractFile, evt: MouseEvent | KeyboardEvent): void {
        if (item instanceof TFile) {
            const leaf: WorkspaceLeaf = this.app.workspace.getLeaf(Keymap.isModEvent(evt));
            void leaf.openFile(item);
        } else if (item instanceof TFolder) {
            new FolderNavigatorModal(this.app, this.settings, item, this.currentSort).open();
        }
    }
}