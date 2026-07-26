import { App, MarkdownView, Notice } from "obsidian";
import { extractLinksFromView, LinksModal } from "../ui/links-modal";

/**
 * Command implementation for "Link searcher".
 * Displays a modal listing all links/embeds in order for the active markdown view.
 */
export function linkSearcher(app: App): void {
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (!activeView) {
    new Notice("No active Markdown note");
    return;
  }

  const links = extractLinksFromView(app, activeView);
  if (links.length === 0) {
    new Notice("No links found in active note");
    return;
  }

  new LinksModal(app, activeView, links).open();
}
