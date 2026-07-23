import { Hotkey, Modifier } from "obsidian";

declare module "obsidian" {
  interface HotkeyManager {
    printHotkey(hotkey: Hotkey): string;
  }
  interface App {
    hotkeyManager?: HotkeyManager;
  }
}

/**
 * Parses a string representation like "Mod+Shift+ArrowDown" into Obsidian's native `Hotkey` interface (`{ modifiers, key }`).
 */
export function parseHotkey(hotkeyStr: string): Hotkey | null {
  const trimmed = hotkeyStr.trim();
  if (!trimmed) return null;

  const parts = trimmed.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const rawKey = parts.pop();
  if (!rawKey) return null;

  const modifiers: Modifier[] = [];
  for (const token of parts) {
    const lower = token.toLowerCase();
    if (lower === "mod" || lower === "cmd" || lower === "command") {
      if (!modifiers.includes("Mod")) modifiers.push("Mod");
    } else if (lower === "ctrl" || lower === "control") {
      if (!modifiers.includes("Ctrl")) modifiers.push("Ctrl");
    } else if (lower === "shift") {
      if (!modifiers.includes("Shift")) modifiers.push("Shift");
    } else if (lower === "alt" || lower === "option" || lower === "opt") {
      if (!modifiers.includes("Alt")) modifiers.push("Alt");
    } else if (lower === "meta") {
      if (!modifiers.includes("Meta")) modifiers.push("Meta");
    }
  }

  const keyLower = rawKey.toLowerCase();
  let key = rawKey;
  if (keyLower === "down" || keyLower === "arrowdown") key = "ArrowDown";
  else if (keyLower === "up" || keyLower === "arrowup") key = "ArrowUp";
  else if (keyLower === "left" || keyLower === "arrowleft") key = "ArrowLeft";
  else if (keyLower === "right" || keyLower === "arrowright") key = "ArrowRight";

  return { modifiers, key };
}
