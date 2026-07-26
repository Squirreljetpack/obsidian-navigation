import { App, EditorPosition, EditorSelectionOrCaret, Keymap, MarkdownView, Platform, SuggestModal } from "obsidian";
import { LinkItem, extractLinksFromView, parseLinksFromText } from "../utils/link-parser.js";

export type { LinkItem };
export { extractLinksFromView, parseLinksFromText };

declare module "obsidian" {
  interface SuggestModal<T> {
    chooser?: {
      values?: T[];
      selectedItem: number;
      setSelectedItem(index: number, evt?: MouseEvent | KeyboardEvent): void;
      updateSuggestions?(): void;
    };
  }
}

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

  constructor(app: App, view: MarkdownView, items: LinkItem[]) {
    super(app);
    this.view = view;
    this.items = items;

    this.setPlaceholder("Filter links...");
    this.updateInstructions();
    this.registerKeybindings();
  }

  onOpen(): void {
    void super.onOpen();

    this.saveOriginalState();

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
      const previewMode = view.previewMode as unknown as { containerEl?: HTMLElement };
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
      const previewMode = view.previewMode as unknown as { containerEl?: HTMLElement };
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
    const item = this.chooser?.values?.[index] ?? this.items[index];
    if (!item) return;
    this.navigateToLink(item);
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
      const previewMode = view.previewMode as unknown as { applyScroll?: (line: number) => void; containerEl?: HTMLElement };
      if (typeof previewMode.applyScroll === "function") {
        previewMode.applyScroll(item.position.start.line);
      }

      const container = previewMode.containerEl;
      if (container) {
        const elements = Array.from(
          container.querySelectorAll<HTMLElement>("a.internal-link, a.external-link, .internal-embed, img")
        );

        let matchedEl: HTMLElement | null = elements[item.index] ?? null;

        if (!matchedEl) {
          matchedEl =
            elements.find((el) => {
              const href = el.getAttribute("data-href") || el.getAttribute("href") || el.getAttribute("src");
              if (href && (href === item.target || href.endsWith(item.target))) return true;
              if (el.textContent && el.textContent.trim() === item.text.trim()) return true;
              return false;
            }) ?? null;
        }

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
    const openMod = isMac ? "⌘↵" : "Ctrl+Enter";
    const toggleMod = isMac ? "⌘S" : "Ctrl+S";
    const togglePurpose = this.showHeadingOnRight ? "Show line" : "Show heading";

    this.setInstructions([
      { command: "↑↓", purpose: "Navigate" },
      { command: "↵", purpose: "Jump to link" },
      { command: openMod, purpose: "Open target" },
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
        void this.openTarget(item);
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
    if (this.chooser?.values && typeof this.chooser.selectedItem === "number") {
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
      void this.openTarget(item);
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
      const previewMode = view.previewMode as unknown as { applyScroll?: (line: number) => void; containerEl?: HTMLElement };
      if (typeof previewMode.applyScroll === "function") {
        previewMode.applyScroll(item.position.start.line);
      }

      const container = previewMode.containerEl;
      if (container) {
        const elements = Array.from(
          container.querySelectorAll<HTMLElement>("a.internal-link, a.external-link, .internal-embed, img")
        );

        let matchedEl: HTMLElement | null = elements[item.index] ?? null;

        if (!matchedEl) {
          matchedEl =
            elements.find((el) => {
              const href = el.getAttribute("data-href") || el.getAttribute("href") || el.getAttribute("src");
              if (href && (href === item.target || href.endsWith(item.target))) return true;
              if (el.textContent && el.textContent.trim() === item.text.trim()) return true;
              return false;
            }) ?? null;
        }

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

  private async openTarget(item: LinkItem): Promise<void> {
    const target = item.target.trim();
    if (!target) return;

    if (/^(https?:\/\/|mailto:|file:\/\/|ftp:\/\/|www\.)/i.test(target)) {
      const url = target.startsWith("www.") ? `https://${target}` : target;
      window.open(url, "_blank");
      return;
    }

    const activeFile = this.view.file;
    const sourcePath = activeFile ? activeFile.path : "";
    await this.app.workspace.openLinkText(target, sourcePath, true);
  }
}
