import type { App, MarkdownView } from "obsidian";

/**
 * Decode percent-escapes in the heading anchor of a markdown link target.
 * Only the fragment after `#` is decoded — the file path is left alone so
 * that wiki links (which use literal characters, no encoding) and file
 * paths that happen to contain `%` are not mangled. URLs (anything with a
 * scheme like `http://`, `https://`, `mailto:`, etc.) are also left
 * alone since their fragment is part of the URL, not a heading anchor.
 * No-op when the target has no `#` or the fragment has no `%`.
 */
function decodeMarkdownHeadingAnchor(target: string): string {
	const hashIndex = target.indexOf("#");
	if (hashIndex === -1) return target;
	const path = target.slice(0, hashIndex);
	const heading = target.slice(hashIndex + 1);
	// Skip URLs — their `#fragment` is part of the URL semantics, not an
	// Obsidian heading anchor, and decoding it would corrupt the URL.
	if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return target;
	if (heading.indexOf("%") === -1) return target;
	try {
		return path + "#" + decodeURIComponent(heading);
	} catch {
		// Malformed percent-escape (e.g. a trailing `%`); leave the target
		// alone so Obsidian can surface its own error.
		return target;
	}
}

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

export function offsetToPos(
	text: string,
	offset: number,
): { line: number; col: number; offset: number } {
	const textBefore = text.slice(0, offset);
	const lines = textBefore.split("\n");
	const line = lines.length - 1;
	const col = (lines[line] ?? "").length;
	return { line, col, offset };
}

export function findSectionHeading(
	headings: SectionHeadingInfo[],
	start?: { line: number; col?: number; offset?: number },
): string | undefined {
	if (!start) return undefined;
	let sectionHeading: string | undefined;
	for (const h of headings) {
		if (
			h.line < start.line ||
			(h.line === start.line &&
				(start.offset === undefined || h.offset <= start.offset))
		) {
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
	// Matches WikiLinks (!?[[target|display]]) OR Markdown links (!?[display](target))
	// including markdown links containing nested image embeds like [![alt](img)](#target)
	const regex =
		/(!)?\[\[([^\]|#]+)?(#?[^\]|]*)?(?:\|([^\]]+))?\]\]|(!)?\[((?:[^[\]]|!\[[^[\]]*\]\([^()]*\))*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const fullMatch = match[0];
		const offset = match.index;
		const endOffset = offset + fullMatch.length;

		let isEmbed = false;
		let target = "";
		let displayText = "";

		if (match[2] !== undefined || match[3] !== undefined) {
			// Wiki link or embed — wiki links use literal characters, no
			// percent-decoding is needed (or wanted, since the page name may
			// legitimately contain `%`).
			isEmbed = match[1] === "!";
			const page = match[2] ?? "";
			const anchor = match[3] ?? "";
			target = (page + anchor).trim();
			displayText = (match[4] ?? target).trim();
		} else if (match[7] !== undefined) {
			// Markdown link or embed — decode percent-escapes in the heading
			// anchor so Obsidian resolves `path#Section%20With%20Spaces`
			// against the actual heading instead of the raw string.
			isEmbed = match[5] === "!";
			const rawDisplay = (match[6] ?? "").trim();
			// If display text contains an embedded image ![alt](src), clean it for display
			displayText =
				rawDisplay.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").trim() ||
				rawDisplay;
			target = decodeMarkdownHeadingAnchor(match[7].trim());
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
	let content = "";
	if (view.getMode() === "source" && view.editor) {
		content = view.editor.getValue();
	} else if (view.data) {
		content = view.data;
	}

	const file = view.file;
	if (!content && file) {
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.links || cache?.embeds) {
			// fallback to metadataCache parsing if no content loaded in view
			const headings: SectionHeadingInfo[] = (cache.headings ?? []).map(
				(h) => ({
					heading: h.heading,
					line: h.position.start.line,
					offset: h.position.start.offset,
				}),
			);

			const items: LinkItem[] = [];
			if (cache.links) {
				for (const l of cache.links) {
					const text =
						l.displayText && l.displayText.trim()
							? l.displayText.trim()
							: l.link;
					const sectionHeading = findSectionHeading(
						headings,
						l.position?.start,
					);
					// Wiki links (`[[...]]`) keep the raw target — only
					// markdown links (`[...](...)`) get their heading anchor
					// decoded.
					const isWiki = l.original?.startsWith("[[") ?? false;
					const target = isWiki ? l.link : decodeMarkdownHeadingAnchor(l.link);
					items.push({
						text,
						target,
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
					const text =
						e.displayText && e.displayText.trim()
							? e.displayText.trim()
							: e.link;
					const sectionHeading = findSectionHeading(
						headings,
						e.position?.start,
					);
					const isWiki = e.original?.startsWith("![[") ?? false;
					const target = isWiki ? e.link : decodeMarkdownHeadingAnchor(e.link);
					items.push({
						text,
						target,
						original: e.original,
						isEmbed: true,
						position: e.position,
						index: 0,
						sectionHeading,
					});
				}
			}
			items.sort(
				(a, b) =>
					(a.position?.start?.offset ?? 0) - (b.position?.start?.offset ?? 0),
			);
			items.forEach((item, idx) => {
				item.index = idx;
			});
			return items;
		}
	}

	if (content) {
		const items = parseLinksFromText(content);
		if (file) {
			const cache = app.metadataCache.getFileCache(file);
			if (cache?.headings) {
				const headings: SectionHeadingInfo[] = cache.headings.map((h) => ({
					heading: h.heading,
					line: h.position.start.line,
					offset: h.position.start.offset,
				}));
				for (const item of items) {
					if (!item.sectionHeading) {
						item.sectionHeading = findSectionHeading(
							headings,
							item.position.start,
						);
					}
				}
			}
		}
		return items;
	}

	return [];
}
