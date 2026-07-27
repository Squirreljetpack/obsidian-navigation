import { App, EditorPosition, EditorSelectionOrCaret, Keymap, MarkdownView, Platform, SuggestModal } from "obsidian";
import { LinkItem, extractLinksFromView, parseLinksFromText } from "../utils/link-parser.js";

export type { LinkItem };
export { extractLinksFromView, parseLinksFromText };



export class LinksModal extends SuggestModal<LinkItem> {
  private view: MarkdownView;
  private items: LinkItem[];
  private showHeadingOnRight = false;
  private accepted = false;

  private originalScrollInfo: { left: number; top: number } | null = null;
  private originalCursor: EditorPosition | null = null;
  private originalSelections: EditorSelectionOrCaret[] | null = null;
  private originalPreviewScrollTop: number | null = null;
  private originalPreviewScrollLeft: number | null = null;

  private activePreviewEl: HTMLElement | null = null;
  private initialQuery: string;

  constructor(app: App, view: MarkdownView, items: LinkItem[], initialQuery?: string) {
    super(app);
    this.view = view;
    this.items = items;
    this.initialQuery = initialQuery ?? this.getSelectionFromView(view);

    this.setPlaceholder("Filter links...");
    this.updateInstructions();
    this.registerKeybindings();
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
      const selection = window.getSelection()?.toString();
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

    if (this.chooser) {
      const originalSetSelectedItem = this.chooser.setSelectedItem.bind(this.chooser);
      this.chooser.setSelectedItem = (index: number, evt?: MouseEvent | KeyboardEvent) => {
        originalSetSelectedItem(index, evt);
        this.onSelectionChanged(index);
      };
    }

    const initialIndex = this.chooser?.selectedItem ?? 0;
    this.onSelectionChanged(initialIndex);
  }

  onClose(): void {
    super.onClose();
    this.clearPreviewHighlight();
    if (!this.accepted) {
      this.restoreOriginalState();
    }
  }

  private saveOriginalState(): void {
    const view = this.view;
    const mode = view.getMode();

    if (mode === "source") {
      const editor = view.editor;
      if (editor) {
        this.originalScrollInfo = editor.getScrollInfo();
        this.originalCursor = editor.getCursor();
        this.originalSelections = editor.listSelections();
      }
    } else if (mode === "preview") {
      const previewMode = view.previewMode;
      if (previewMode?.containerEl) {
        this.originalPreviewScrollTop = previewMode.containerEl.scrollTop;
        this.originalPreviewScrollLeft = previewMode.containerEl.scrollLeft;
      }
    }
  }

  private restoreOriginalState(): void {
    const view = this.view;
    const mode = view.getMode();

    if (mode === "source") {
      const editor = view.editor;
      if (editor) {
        if (this.originalScrollInfo) {
          editor.scrollTo(this.originalScrollInfo.left, this.originalScrollInfo.top);
        }
        if (this.originalSelections && this.originalSelections.length > 0) {
          editor.setSelections(this.originalSelections);
        } else if (this.originalCursor) {
          editor.setCursor(this.originalCursor);
        }
      }
    } else if (mode === "preview") {
      const previewMode = view.previewMode;
      if (previewMode?.containerEl) {
        if (this.originalPreviewScrollTop !== null) {
          previewMode.containerEl.scrollTop = this.originalPreviewScrollTop;
        }
        if (this.originalPreviewScrollLeft !== null) {
          previewMode.containerEl.scrollLeft = this.originalPreviewScrollLeft;
        }
      }
    }
  }

  private onSelectionChanged(index: number): void {
    if (this.chooser?.values) {
      const item = this.chooser.values[index];
      if (!item) return;
      this.navigateToLink(item);
      return;
    }
    const item = this.items[index];
    if (!item) return;
    this.navigateToLink(item);
  }

  private findPreviewElement(container: HTMLElement, item: LinkItem): HTMLElement | null {
    const candidates = Array.from(
      container.querySelectorAll<HTMLElement>("a.internal-link, a.external-link, a[href], a[data-href], .internal-embed, img")
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
    const sameTargetItems = this.items.filter((i) => normTarget(i.target) === targetKey);
    const occurrenceIndex = sameTargetItems.indexOf(item);

    const matchingElements = candidates.filter((el) => {
      const raw = el.getAttribute("data-href") || el.getAttribute("href") || el.getAttribute("src");
      if (!raw) return false;
      const key = normTarget(raw);
      if (key === targetKey || key.endsWith(targetKey) || targetKey.endsWith(key)) {
        return true;
      }
      return false;
    });

    if (matchingElements.length > 0) {
      const index = occurrenceIndex >= 0 && occurrenceIndex < matchingElements.length
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
        const textOccurrence = this.items.filter((i) => normText(i.text) === textKey).indexOf(item);
        const index = textOccurrence >= 0 && textOccurrence < textMatches.length ? textOccurrence : 0;
        return textMatches[index] ?? null;
      }
    }

    const idxEl = candidates[item.index];
    if (idxEl) {
      const raw = idxEl.getAttribute("data-href") || idxEl.getAttribute("href") || idxEl.getAttribute("src") || "";
      if (normTarget(raw) === targetKey || (idxEl.textContent && normText(idxEl.textContent) === textKey)) {
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

      const start = { line: item.position.start.line, ch: item.position.start.col };
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
    const togglePurpose = this.showHeadingOnRight ? "Show line" : "Show heading";

    this.setInstructions([
      { command: "↑↓", purpose: "Navigate" },
      { command: "↵", purpose: "Jump to link" },
      { command: openSameMod, purpose: "Open target" },
      { command: openNewMod, purpose: "Open in new tab" },
      { command: toggleMod, purpose: togglePurpose },
      { command: "Esc", purpose: "Dismiss" },
    ]);
  }

  private registerKeybindings(): void {
    this.scope.register(["Mod"], "Enter", (evt: KeyboardEvent) => {
      evt.preventDefault();
      const item = this.getHighlightedItem();
      if (item) {
        this.close();
        void this.openTarget(item, true);
      }
    });

    this.scope.register(["Shift"], "Enter", (evt: KeyboardEvent) => {
      evt.preventDefault();
      const item = this.getHighlightedItem();
      if (item) {
        this.close();
        void this.openTarget(item, false);
      }
    });

    this.scope.register(["Mod"], "s", (evt: KeyboardEvent) => {
      evt.preventDefault();
      this.showHeadingOnRight = !this.showHeadingOnRight;
      this.updateInstructions();
      this.refreshSuggestions();
    });
  }

  private refreshSuggestions(): void {
    if (this.chooser?.updateSuggestions) {
      this.chooser.updateSuggestions();
    } else {
      this.inputEl.dispatchEvent(new Event("input"));
    }
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
    return this.items.filter((item) =>
      item.text.toLowerCase().includes(q) ||
      item.target.toLowerCase().includes(q) ||
      item.original.toLowerCase().includes(q) ||
      (item.sectionHeading && item.sectionHeading.toLowerCase().includes(q))
    );
  }

  renderSuggestion(item: LinkItem, el: HTMLElement): void {
    el.addClass("link-modal-item");

    const container = el.createDiv({ cls: "link-modal-content" });

    container.createSpan({ cls: "link-modal-text", text: item.text });
    container.createSpan({ cls: "link-modal-arrow", text: " -> " });
    container.createSpan({ cls: "link-modal-target", text: item.target });

    if (item.isEmbed) {
      container.createSpan({ cls: "link-modal-badge", text: "embed" });
    }

    const rightText = (this.showHeadingOnRight && item.sectionHeading)
      ? item.sectionHeading
      : `${item.position.start.line + 1}`;

    container.createSpan({ cls: "link-modal-line-number", text: rightText });
  }

  onChooseSuggestion(item: LinkItem, evt: MouseEvent | KeyboardEvent): void {
    if (evt && (evt.metaKey || evt.ctrlKey || Keymap.isModEvent(evt))) {
      void this.openTarget(item, true);
    } else if (evt && evt.shiftKey) {
      void this.openTarget(item, false);
    } else {
      this.accepted = true;
      this.jumpToLink(item);
    }
  }

  private jumpToLink(item: LinkItem): void {
    const view = this.view;
    const app = this.app;

    app.workspace.setActiveLeaf(view.leaf, { focus: true });

    const mode = view.getMode();
    if (mode === "source") {
      const editor = view.editor;
      const start = { line: item.position.start.line, ch: item.position.start.col };
      const end = { line: item.position.end.line, ch: item.position.end.col };

      editor.setCursor(start);
      editor.setSelection(start, end);
      editor.scrollIntoView({ from: start, to: end }, true);
      editor.focus();
    } else if (mode === "preview") {
      const previewMode = view.previewMode;
      previewMode?.applyScroll?.(item.position.start.line);

      const container = previewMode?.containerEl;
      if (container) {
        const matchedEl = this.findPreviewElement(container, item);

        if (matchedEl) {
          matchedEl.scrollIntoView({ behavior: "smooth", block: "center" });
          matchedEl.addClass("link-jump-highlight");
          window.setTimeout(() => {
            matchedEl?.removeClass("link-jump-highlight");
          }, 1500);
        }
      }
    }
  }

  private async openTarget(item: LinkItem, newLeaf = true): Promise<void> {
    const target = item.target.trim();
    if (!target) return;

    if (/^(https?:\/\/|mailto:|file:\/\/|ftp:\/\/|www\.)/i.test(target)) {
      const url = target.startsWith("www.") ? `https://${target}` : target;
      window.open(url, "_blank");
      return;
    }

    const activeFile = this.view.file;
    const sourcePath = activeFile ? activeFile.path : "";
    await this.app.workspace.openLinkText(target, sourcePath, newLeaf);
  }
}
