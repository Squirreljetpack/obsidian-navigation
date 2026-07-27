import type { Hotkey, TAbstractFile } from "obsidian";

declare module "obsidian" {
	interface HotkeyManager {
		printHotkey(hotkey: Hotkey): string;
	}

	interface App {
		hotkeyManager?: HotkeyManager;
		showInFolder?: (path: string) => void;
		commands?: {
			commands?: Record<string, { id: string; name?: string }>;
			executeCommandById?: (id: string) => boolean;
		};
		plugins?: {
			plugins?: Record<
				string,
				{ enabled?: boolean; active?: boolean; header?: { active?: boolean } }
			>;
		};
	}

	interface SuggestModal<T> {
		chooser?: {
			values?: T[];
			selectedItem: number;
			setSelectedItem(index: number, evt?: MouseEvent | KeyboardEvent): void;
			updateSuggestions?(): void;
		};
	}

	/** Scope runtime API — not fully exposed in the public types but used by plugins */
	interface Scope {
		keys: Array<{
			key: string;
			handlers: Array<{
				modifiers: string[];
				callback: (...args: unknown[]) => unknown;
			}>;
		}>;
		unregister(keyInfo: {
			key: string;
			handlers: Array<{
				modifiers: string[];
				callback: (...args: unknown[]) => unknown;
			}>;
		}): void;
	}

	interface MarkdownView {
		previewMode?: {
			containerEl?: HTMLElement;
			applyScroll?: (line: number) => void;
		};
	}

	interface MarkdownPreviewView {
		renderer?: {
			sections?: Array<{
				el?: HTMLElement;
				start?: { line?: number };
				lineStart?: number;
				line?: number;
			}>;
		};
	}

	interface View {
		revealInFolder?: (file: TAbstractFile) => void;
	}
}
