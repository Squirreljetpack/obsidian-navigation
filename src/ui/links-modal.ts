import {
	type App,
	type MarkdownView,
	Platform,
	SuggestModal,
	type ViewState,
	type WorkspaceLeaf,
} from "obsidian";
import {
	type LinkItem,
	extractLinksFromView,
	parseLinksFromText,
} from "../utils/link-parser.js";

export type { LinkItem };
export { extractLinksFromView, parseLinksFromText };

/**
 * A link picker for the active markdown view.
 *
 * Arrow keys drive a live preview: as you move through the list the
 * corresponding link gets selected/scrolled-to in the source or preview
 * pane. Two dismissal paths:
 *
 * - Accept (Enter / plain click on a row): close without restoring. The
 *   live preview has already moved the cursor (or scrolled the preview)
 *   to the selected link, so the user stays at that position.
 * - Dismiss (Esc / click away from the modal): close AND restore the
 *   original cursor / scroll position.
 *
 * Modifier combinations open the link's target (the file the link
 * points to) using `Workspace.openLinkText` so Obsidian picks the most
 * appropriate leaf.
 *
 * Keybindings:
 * - `Enter` / plain click            → accept (close; stay at the link)
 * - `Esc` / click away               → dismiss (close + restore)
 * - `Shift+Enter` / shift+click      → open target in the current leaf
 * - `Mod+Enter` / mod+click          → open target in a new leaf
 * - `Mod+S`                          → toggle line/heading on the right
 */
export class LinksModal extends SuggestModal<LinkItem> {
	private view: MarkdownView;
	private items: LinkItem[];
	private initialQuery: string;
	private showHeadingOnRight = false;
	private accepted = false;

	private originalLeaf: WorkspaceLeaf | null = null;
	private originalLeafState: ViewState | null = null;
	private originalLeafEState: Record<string, unknown> | null = null;

	private activePreviewEl: HTMLElement | null = null;

	constructor(
		app: App,
		view: MarkdownView,
		items: LinkItem[],
		initialQuery?: string,
	) {
		super(app);
		this.view = view;
		this.items = items;
		this.initialQuery = initialQuery ?? this.getSelectionFromView(view);

		this.setPlaceholder("Filter links...");
		this.updateInstructions();
	}

	private getSelectionFromView(view: MarkdownView): string {
		const mode = view.getMode();
		if (mode === "source") {
			const editor = view.editor;
			if (editor) {
				const selection = editor.getSelection();
				if (selection) {
					return selection.trim().replace(/\s+/g, " ");
				}
			}
		} else if (mode === "preview") {
			const selection = activeWindow.getSelection()?.toString();
			if (selection) {
				return selection.trim().replace(/\s+/g, " ");
			}
		}
		return "";
	}

	onOpen(): void {
		void super.onOpen();
		this.saveOriginalState();

		if (this.initialQuery) {
			this.inputEl.value = this.initialQuery;
			this.inputEl.dispatchEvent(new Event("input"));
			this.inputEl.select();
		}

		// Defaults are added by the parent's onOpen. The default `[]` Enter
		// scope handler in the Suggester already routes through
		// onChooseSuggestion, so plain Enter / click land in our routing
		// automatically. We only need to register the modifier combinations
		// the defaults don't cover (Shift+Enter, Mod+Enter, Mod+S).
		this.registerKeybindings();

		if (this.chooser) {
			const originalSetSelectedItem = this.chooser.setSelectedItem.bind(
				this.chooser,
			);
			this.chooser.setSelectedItem = (
				index: number,
				evt?: MouseEvent | KeyboardEvent,
			) => {
				originalSetSelectedItem(index, evt);
				this.onSelectionChanged(index);
			};
		}

		// Trigger the initial auto-preview (setSelectedItem's hook is only
		// installed above, so the chooser's first auto-select does not
		// invoke it).
		const initialIndex = this.chooser?.selectedItem ?? 0;
		this.onSelectionChanged(initialIndex);
	}

	onClose(): void {
		this.clearPreviewHighlight();
		super.onClose();
		if (!this.accepted) {
			// Defer restoration so Obsidian's modal cleanup (focus, scroll)
			// finishes first. Matches the pattern used by
			// another-quick-switcher so that CodeMirror has finished
			// re-rendering before we restore the cursor/scroll.
			const restore = () => this.restoreOriginalState();
			if (typeof window.requestAnimationFrame === "function") {
				window.requestAnimationFrame(() => window.setTimeout(restore, 0));
			} else {
				window.setTimeout(restore, 0);
			}
		}
	}

	private registerKeybindings(): void {
		// Shift+Enter — open target in the current leaf. The default `[]`
		// Enter scope binding won't match a Shift-modified keypress, so we
		// route it through onChooseSuggestion ourselves to keep the action
		// logic in one place.
		this.scope.register(["Shift"], "Enter", (evt: KeyboardEvent) => {
			if (evt.isComposing) return;
			evt.preventDefault();
			const item = this.getHighlightedItem();
			if (item) this.onChooseSuggestion(item, evt);
			return false;
		});

		// Mod+Enter — open target in a new leaf. Same routing.
		this.scope.register(["Mod"], "Enter", (evt: KeyboardEvent) => {
			if (evt.isComposing) return;
			evt.preventDefault();
			const item = this.getHighlightedItem();
			if (item) this.onChooseSuggestion(item, evt);
			return false;
		});

		// Mod+S — toggle line/heading on the right, preserve selection.
		this.scope.register(["Mod"], "s", (evt: KeyboardEvent) => {
			if (evt.isComposing) return;
			evt.preventDefault();
			this.toggleShowHeadingOnRight();
			return false;
		});
	}

	private toggleShowHeadingOnRight(): void {
		// Snapshot the currently-highlighted item by a stable key so we can
		// re-locate it after the chooser re-renders. `offset` is unique per
		// occurrence in the source, which is exactly what we need.
		const currentItem = this.getHighlightedItem();
		const currentKey = currentItem ? this.itemKey(currentItem) : null;

		this.showHeadingOnRight = !this.showHeadingOnRight;
		this.updateInstructions();

		if (this.chooser?.updateSuggestions) {
			this.chooser.updateSuggestions();
		} else {
			this.inputEl.dispatchEvent(new Event("input"));
		}

		if (currentKey && this.chooser?.values) {
			const newIndex = this.chooser.values.findIndex(
				(item) => this.itemKey(item) === currentKey,
			);
			if (newIndex >= 0) {
				this.chooser.setSelectedItem(newIndex);
			}
		}
	}

	private itemKey(item: LinkItem): string {
		return `${item.position.start.offset}`;
	}

	private saveOriginalState(): void {
		// Capture the current leaf's view + ephemeral state. On dismiss we
		// hand these back to setViewState, which is Obsidian's own
		// restore path (handles both source-mode cursor+scroll and
		// preview-mode scroll uniformly). Modeled on the
		// captureStateInFile pattern in obsidian-another-quick-switcher.
		const leaf = this.view.leaf;
		if (!leaf) return;
		this.originalLeaf = leaf;
		this.originalLeafState = leaf.getViewState();
		this.originalLeafEState = leaf.getEphemeralState();
	}

	private restoreOriginalState(): void {
		// Safety guard: never restore on accept, regardless of caller.
		if (this.accepted) return;
		const leaf = this.originalLeaf;
		if (!leaf || !this.originalLeafState) return;
		void leaf.setViewState(
			{
				...this.originalLeafState,
				active: true,
				popstate: true,
			} as ViewState,
			this.originalLeafEState ?? {},
		);
	}

	private onSelectionChanged(index: number): void {
		const item = this.chooser?.values?.[index] ?? this.items[index];
		if (!item) return;
		this.navigateToLink(item);
	}

	private findPreviewElement(
		container: HTMLElement,
		item: LinkItem,
	): HTMLElement | null {
		const candidates = Array.from(
			container.querySelectorAll<HTMLElement>(
				"a.internal-link, a.external-link, a[href], a[data-href], .internal-embed, img",
			),
		);

		const normTarget = (t: string) => {
			let cleaned = t.trim();
			try {
				cleaned = decodeURIComponent(cleaned);
			} catch {
				// ignore
			}
			return cleaned.replace(/^[#/.\\]+/, "").toLowerCase();
		};

		const targetKey = normTarget(item.target);
		const sameTargetItems = this.items.filter(
			(i) => normTarget(i.target) === targetKey,
		);
		const occurrenceIndex = sameTargetItems.indexOf(item);

		const matchingElements = candidates.filter((el) => {
			const raw =
				el.getAttribute("data-href") ||
				el.getAttribute("href") ||
				el.getAttribute("src");
			if (!raw) return false;
			const key = normTarget(raw);
			if (
				key === targetKey ||
				key.endsWith(targetKey) ||
				targetKey.endsWith(key)
			) {
				return true;
			}
			return false;
		});

		if (matchingElements.length > 0) {
			const index =
				occurrenceIndex >= 0 && occurrenceIndex < matchingElements.length
					? occurrenceIndex
					: 0;
			return matchingElements[index] ?? null;
		}

		const normText = (txt: string) => txt.trim().toLowerCase();
		const textKey = normText(item.text);

		if (textKey) {
			const textMatches = candidates.filter((el) => {
				const txt = el.textContent ? normText(el.textContent) : "";
				return txt === textKey || (txt.length > 0 && textKey.includes(txt));
			});

			if (textMatches.length > 0) {
				const textOccurrence = this.items
					.filter((i) => normText(i.text) === textKey)
					.indexOf(item);
				const index =
					textOccurrence >= 0 && textOccurrence < textMatches.length
						? textOccurrence
						: 0;
				return textMatches[index] ?? null;
			}
		}

		const idxEl = candidates[item.index];
		if (idxEl) {
			const raw =
				idxEl.getAttribute("data-href") ||
				idxEl.getAttribute("href") ||
				idxEl.getAttribute("src") ||
				"";
			if (
				normTarget(raw) === targetKey ||
				(idxEl.textContent && normText(idxEl.textContent) === textKey)
			) {
				return idxEl;
			}
		}

		return null;
	}

	private navigateToLink(item: LinkItem): void {
		const view = this.view;
		const mode = view.getMode();

		if (mode === "source") {
			const editor = view.editor;
			if (!editor) return;

			const start = {
				line: item.position.start.line,
				ch: item.position.start.col,
			};
			const end = { line: item.position.end.line, ch: item.position.end.col };

			editor.setCursor(start);
			editor.setSelection(start, end);
			editor.scrollIntoView({ from: start, to: end }, true);
		} else if (mode === "preview") {
			const previewMode = view.previewMode;
			previewMode?.applyScroll?.(item.position.start.line);

			const container = previewMode?.containerEl;
			if (container) {
				const matchedEl = this.findPreviewElement(container, item);
				this.clearPreviewHighlight();

				if (matchedEl) {
					matchedEl.scrollIntoView({ behavior: "auto", block: "center" });
					matchedEl.addClass("link-jump-highlight");
					this.activePreviewEl = matchedEl;
				}
			}
		}
	}

	private clearPreviewHighlight(): void {
		if (this.activePreviewEl) {
			this.activePreviewEl.removeClass("link-jump-highlight");
			this.activePreviewEl = null;
		}
	}

	private updateInstructions(): void {
		const isMac = Platform.isMacOS;
		const openNewMod = isMac ? "⌘↵" : "Ctrl+Enter";
		const openSameMod = isMac ? "⇧↵" : "Shift+Enter";
		const toggleMod = isMac ? "⌘S" : "Ctrl+S";
		const togglePurpose = this.showHeadingOnRight
			? "Show line"
			: "Show heading";

		this.setInstructions([
			{ command: "↑↓", purpose: "Navigate" },
			{ command: "↵", purpose: "Dismiss" },
			{ command: openSameMod, purpose: "Open target" },
			{ command: openNewMod, purpose: "Open in new tab" },
			{ command: toggleMod, purpose: togglePurpose },
			{ command: "Esc", purpose: "Dismiss" },
		]);
	}

	private getHighlightedItem(): LinkItem | null {
		if (this.chooser?.values && this.chooser.selectedItem !== undefined) {
			return this.chooser.values[this.chooser.selectedItem] ?? null;
		}
		return null;
	}

	getSuggestions(query: string): LinkItem[] {
		const q = query.toLowerCase().trim();
		if (!q) return this.items;
		return this.items.filter(
			(item) =>
				item.text.toLowerCase().includes(q) ||
				item.target.toLowerCase().includes(q) ||
				item.original.toLowerCase().includes(q) ||
				(item.sectionHeading && item.sectionHeading.toLowerCase().includes(q)),
		);
	}

	renderSuggestion(item: LinkItem, el: HTMLElement): void {
		el.addClass("link-modal-item");
		el.empty();

		const container = el.createDiv({ cls: "link-modal-content" });

		container.createSpan({ cls: "link-modal-text", text: item.text });
		container.createSpan({ cls: "link-modal-arrow", text: " → " });
		container.createSpan({ cls: "link-modal-target", text: item.target });

		if (item.isEmbed) {
			container.createSpan({ cls: "link-modal-badge", text: "embed" });
		}

		const rightText =
			this.showHeadingOnRight && item.sectionHeading
				? item.sectionHeading
				: `${item.position.start.line + 1}`;

		container.createSpan({ cls: "link-modal-line-number", text: rightText });
	}

	onChooseSuggestion(item: LinkItem, evt: MouseEvent | KeyboardEvent): void {
		// Single routing point for plain click, plain Enter (via the
		// Suggester's default `[]` Enter scope handler), and our explicit
		// Shift+Enter / Mod+Enter scope bindings. Modifier-aware dispatch:
		// - plain click / plain Enter  → accept (close; live preview kept
		//   the cursor/scroll at the link, so no restore is needed)
		// - shift+click / shift+Enter  → open target in the current leaf
		// - cmd/ctrl+click / mod+Enter → open target in a new leaf
		// The Suggester does not close the modal on its own, so we close
		// here for every path.
		if (evt?.metaKey || evt?.ctrlKey) {
			this.accepted = true;
			void this.openTarget(item, true);
		} else if (evt?.shiftKey) {
			this.accepted = true;
			void this.openTarget(item, false);
		} else {
			// Accept — close without restoring. Explicitly jump the
			// cursor (source) or scroll the preview to the link so the
			// user lands at the right spot even when the Suggester's
			// click path bypasses our setSelectedItem hook.
			this.accepted = true;
			this.navigateToLink(item);
		}
		this.close();
	}

	private async openTarget(item: LinkItem, newLeaf = true): Promise<void> {
		const target = item.target.trim();
		if (!target) return;

		const activeFile = this.view.file;
		const sourcePath = activeFile ? activeFile.path : "";
		await this.app.workspace.openLinkText(target, sourcePath, newLeaf);
	}
}
