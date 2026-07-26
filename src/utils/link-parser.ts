import { App, MarkdownView } from "obsidian";

export interface LinkItem {
  text: string;
  target: string;
  original: string;
  isEmbed: boolean;
  position: {
    start: { line: number; col: number; offset: number };
    end: { line: number; col: number; offset: number };
  };
  index: number;
  sectionHeading?: string;
}

export interface SectionHeadingInfo {
  heading: string;
  line: number;
  offset: number;
}

export function offsetToPos(text: string, offset: number): { line: number; col: number; offset: number } {
  const textBefore = text.slice(0, offset);
  const lines = textBefore.split("\n");
  const line = lines.length - 1;
  const col = (lines[line] ?? "").length;
  return { line, col, offset };
}

export function findSectionHeading(
  headings: SectionHeadingInfo[],
  start?: { line: number; col?: number; offset?: number }
): string | undefined {
  if (!start) return undefined;
  let sectionHeading: string | undefined = undefined;
  for (const h of headings) {
    if (h.line < start.line || (h.line === start.line && (start.offset === undefined || h.offset <= start.offset))) {
      sectionHeading = h.heading;
    } else {
      break;
    }
  }
  return sectionHeading;
}

export function parseHeadingsFromText(text: string): SectionHeadingInfo[] {
  const headings: SectionHeadingInfo[] = [];
  const regex = /^#{1,6}\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawHeading = match[1];
    if (!rawHeading) continue;
    const headingText = rawHeading.trim();
    const pos = offsetToPos(text, match.index);
    headings.push({
      heading: headingText,
      line: pos.line,
      offset: pos.offset,
    });
  }
  return headings;
}

export function parseLinksFromText(text: string): LinkItem[] {
  const items: LinkItem[] = [];
  const headings = parseHeadingsFromText(text);
  const regex = /(!)?\[\[([^\]|#]+)?(#?[^\]|]*)?(?:\|([^\]]+))?\]\]|(!)?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const offset = match.index;
    const endOffset = offset + fullMatch.length;

    let isEmbed = false;
    let target = "";
    let displayText = "";

    if (match[2] !== undefined || match[3] !== undefined) {
      // Wiki link or embed
      isEmbed = match[1] === "!";
      const page = match[2] ?? "";
      const anchor = match[3] ?? "";
      target = (page + anchor).trim();
      displayText = (match[4] ?? target).trim();
    } else if (match[7] !== undefined) {
      // Markdown link or embed
      isEmbed = match[5] === "!";
      displayText = (match[6] ?? "").trim();
      target = match[7].trim();
    }

    if (!target) continue;

    const startPos = offsetToPos(text, offset);
    const endPos = offsetToPos(text, endOffset);
    const textVal = displayText || target;
    const sectionHeading = findSectionHeading(headings, startPos);

    items.push({
      text: textVal,
      target: target,
      original: fullMatch,
      isEmbed: isEmbed,
      position: {
        start: startPos,
        end: endPos,
      },
      index: 0,
      sectionHeading: sectionHeading,
    });
  }

  items.forEach((item, idx) => {
    item.index = idx;
  });

  return items;
}

export function extractLinksFromView(app: App, view: MarkdownView): LinkItem[] {
  const file = view.file;
  const items: LinkItem[] = [];

  if (file) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache) {
      const headings: SectionHeadingInfo[] = (cache.headings ?? []).map((h) => ({
        heading: h.heading,
        line: h.position.start.line,
        offset: h.position.start.offset,
      }));

      if (cache.links) {
        for (const l of cache.links) {
          const text = l.displayText && l.displayText.trim() ? l.displayText.trim() : l.link;
          const sectionHeading = findSectionHeading(headings, l.position?.start);
          items.push({
            text,
            target: l.link,
            original: l.original,
            isEmbed: false,
            position: l.position,
            index: 0,
            sectionHeading,
          });
        }
      }

      if (cache.embeds) {
        for (const e of cache.embeds) {
          const text = e.displayText && e.displayText.trim() ? e.displayText.trim() : e.link;
          const sectionHeading = findSectionHeading(headings, e.position?.start);
          items.push({
            text,
            target: e.link,
            original: e.original,
            isEmbed: true,
            position: e.position,
            index: 0,
            sectionHeading,
          });
        }
      }
    }
  }

  if (items.length > 0) {
    items.sort((a, b) => (a.position?.start?.offset ?? 0) - (b.position?.start?.offset ?? 0));
    items.forEach((item, idx) => {
      item.index = idx;
    });
    return items;
  }

  // Fallback to raw text parsing if metadataCache has no items
  let content = "";
  if (view.getMode() === "source") {
    content = view.editor.getValue();
  } else if (view.data) {
    content = view.data;
  }

  if (content) {
    return parseLinksFromText(content);
  }

  return [];
}
