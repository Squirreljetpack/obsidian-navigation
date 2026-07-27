import { App, MarkdownView, Plugin, TFile, WorkspaceWindow } from "obsidian";
import { ImageZoomUtil, ModifierKey } from "./image-zoom-util.js";

export interface MouseWheelZoomSettingsProvider {
  mouseWheelZoomModifierKey: ModifierKey;
  mouseWheelZoomStepSize: number;
}

/**
 * Lets the user zoom an image by scrolling over it while holding a modifier
 * key. Obsidian natively renders image width from `![alt|width](target)`
 * and `![[target|width]]` syntax, so this class doesn't track or reapply
 * widths in the DOM - it only gives instant visual feedback while
 * scrolling, then persists the new width to the note. Obsidian's own
 * re-render takes over from there.
 *
 * `WheelEvent` already carries the current modifier key state
 * (altKey/ctrlKey/shiftKey), so there's no need to separately track
 * keydown/keyup - checking the wheel event itself is sufficient, and it
 * naturally means scroll is only ever intercepted while the cursor is
 * directly over an <img>, on a tick-by-tick basis, rather than via a
 * persistent "scroll disabled" state.
 */
export class MouseWheelZoomManager {
  private plugin: Plugin;
  private app: App;
  private getSettings: () => MouseWheelZoomSettingsProvider;
  private pendingSaves = new Map<Element, number>();

  constructor(plugin: Plugin, getSettings: () => MouseWheelZoomSettingsProvider) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.getSettings = getSettings;
  }

  public setup() {
    this.plugin.registerEvent(
      this.app.workspace.on("window-open", (newWindow: WorkspaceWindow) => {
        this.registerEvents(newWindow.win);
      }),
    );
    this.registerEvents(window);
  }

  public onunload() {
    this.clearAllPendingSaves();
  }

  private registerEvents(currentWindow: Window) {
    const doc = currentWindow.document;

    this.plugin.registerDomEvent(
      doc,
      "wheel",
      (evt: WheelEvent) => {
        const target = evt.target as Element;
        if (!target || target.nodeName !== "IMG") return;
        if (!this.isConfiguredKeyDown(evt)) return;

        // Disable scroll zooming when the active view is in Editing Mode (Source / Live Preview)
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.getMode() === "source") return;

        // Only intercept scroll for this specific tick, over this specific
        // image - normal page/pane scrolling is untouched everywhere else.
        evt.preventDefault();
        this.handleZoom(evt, target as HTMLImageElement);
      },
      { passive: false, capture: true },
    );
  }

  private isConfiguredKeyDown(evt: WheelEvent): boolean {
    const settings = this.getSettings();
    switch (settings.mouseWheelZoomModifierKey) {
      case ModifierKey.ALT:
      case ModifierKey.ALT_RIGHT:
        return evt.altKey;
      case ModifierKey.CTRL:
      case ModifierKey.CTRL_RIGHT:
        return evt.ctrlKey;
      case ModifierKey.SHIFT:
      case ModifierKey.SHIFT_RIGHT:
        return evt.shiftKey;
      default:
        return false;
    }
  }

  private handleZoom(evt: WheelEvent, img: HTMLImageElement) {
    const settings = this.getSettings();
    const currentWidth = img.getBoundingClientRect().width || img.clientWidth;

    let newWidth = currentWidth;
    if (evt.deltaY < 0) {
      newWidth = Math.round(currentWidth + settings.mouseWheelZoomStepSize);
    } else if (evt.deltaY > 0 && currentWidth > settings.mouseWheelZoomStepSize) {
      newWidth = Math.round(Math.max(20, currentWidth - settings.mouseWheelZoomStepSize));
    }

    // Instant visual feedback while scrolling. Obsidian will take over
    // rendering the correct width once the saved markdown is re-parsed.
    img.style.setProperty("width", `${newWidth}px`, "important");

    this.scheduleSave(img, newWidth);
  }

  private scheduleSave(img: HTMLImageElement, width: number) {
    const existing = this.pendingSaves.get(img);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }

    const timeoutId = window.setTimeout(() => {
      this.pendingSaves.delete(img);
      void this.saveWidthToDisk(img, width);
    }, 300);
    this.pendingSaves.set(img, timeoutId);
  }

  private clearAllPendingSaves() {
    for (const timeoutId of this.pendingSaves.values()) {
      window.clearTimeout(timeoutId);
    }
    this.pendingSaves.clear();
  }

  private async saveWidthToDisk(img: HTMLImageElement, width: number) {
    const file = this.getActivePaneWithImage(img);
    if (!file) return;

    const rawImageName = ImageZoomUtil.getLocalImageNameFromUri(img.getAttribute("src") ?? "");
    if (!rawImageName) return;

    let imageName = rawImageName;
    try {
      imageName = decodeURIComponent(rawImageName);
    } catch {
      // ignore
    }

    // Disambiguate which occurrence in the note this DOM image corresponds
    // to, for notes that embed the same image multiple times: find this
    // img's position among same-named images in its pane (DOM order), and
    // later rewrite the occurrence at that same position in the source text.
    const ordinal = this.getImageOrdinal(img, rawImageName);

    await this.app.vault.process(file, (text) => this.setImageWidthInText(text, imageName, width, ordinal));
  }

  private getImageOrdinal(img: HTMLImageElement, rawImageName: string): number {
    const container = img.closest<HTMLElement>(".markdown-rendered, .markdown-source-view, .cm-content")
      ?? img.ownerDocument.body;

    const sameNameImages = Array.from(container.querySelectorAll("img")).filter(
      (candidate) => ImageZoomUtil.getLocalImageNameFromUri(candidate.getAttribute("src") ?? "") === rawImageName,
    );

    return sameNameImages.indexOf(img);
  }

  /**
   * Rewrites the width for the image reference at `ordinal` (0-based, in
   * document order) among all references to imageName - supporting both
   * standard markdown links `![alt|width](target)` and Obsidian wiki-style
   * embeds `![[target|width]]`. Any existing size suffix is replaced; if
   * none exists, one is appended.
   */
  private setImageWidthInText(text: string, imageName: string, width: number, ordinal: number): string {
    type Replacement = { start: number; end: number; text: string };
    const replacements: Replacement[] = [];

    const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = mdImageRegex.exec(text)) !== null) {
      const fullMatch = match[0];
      const altText = match[1] ?? "";
      const urlPath = match[2] ?? "";
      if (!urlPath || !this.referencesImage(urlPath, imageName)) continue;

      const pipeIndex = altText.indexOf("|");
      const baseAlt = pipeIndex === -1 ? altText : altText.slice(0, pipeIndex);
      const newAlt = baseAlt ? `${baseAlt}|${width}` : `${width}`;

      replacements.push({
        start: match.index,
        end: match.index + fullMatch.length,
        text: `![${newAlt}](${urlPath})`,
      });
    }

    const wikiImageRegex = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
    while ((match = wikiImageRegex.exec(text)) !== null) {
      const fullMatch = match[0];
      const target = match[1] ?? "";
      if (!target || !this.referencesImage(target, imageName)) continue;

      replacements.push({
        start: match.index,
        end: match.index + fullMatch.length,
        text: `![[${target}|${width}]]`,
      });
    }

    if (replacements.length === 0) return text;

    replacements.sort((a, b) => a.start - b.start);
    const index = ordinal >= 0 && ordinal < replacements.length ? ordinal : 0;
    const chosen = replacements[index];
    if (!chosen) return text; // guard

    return text.slice(0, chosen.start) + chosen.text + text.slice(chosen.end);
  }

  private referencesImage(pathOrTarget: string, imageName: string): boolean {
    if (pathOrTarget.includes(imageName)) return true;
    try {
      return decodeURIComponent(pathOrTarget).includes(imageName);
    } catch {
      return false;
    }
  }

  private getActivePaneWithImage(imageElement: Element): TFile | null {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(imageElement)) {
        return leaf.view.file;
      }
    }
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
  }
}
