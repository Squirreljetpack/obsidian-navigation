# Changelog

## 1.4.2

- **Fix**: Exit Zen mode when toggling sidebars open or exiting fullscreen, using the correct state/command API of Maxymillion's Zen plugin (`settings.enabled` / `zen:toggle`).

## 1.4.0

- **Feature**: Mouse wheel image zoom with configurable modifier key, step size, and initial size text box setting (default 300px).
- **Feature**: Link searcher command palette tool to list and jump to links in the active note.
- **Feature**: Close all views in right sidebar command.

## 1.3.0

- **Feature**: Bind `Tab` in navigator modal to go up to parent folder (same as `Mod + ↑`).
- **Feature**: Bind `Shift + Tab` in navigator modal to reveal highlighted item or folder in Obsidian folder navigation (File Explorer).
- **Feature**: Support custom hotkey overrides so user-configured hotkeys take precedence over built-in modal bindings.
- **Feature**: Command to close all right sidebar views

## 1.2.0

- **Feature**: Add `Toggle fullscreen` command to toggle Obsidian fullscreen mode while automatically collapsing/expanding sidebars.

## 1.1.0

- **Feature**: Bind `Mod + ←` in navigator modal to navigate up to parent folder in-place.
- **Feature**: Bind `Mod + ↑` in navigator modal to reveal highlighted item or current folder in system explorer (Finder / File Explorer).
- **Feature**: Add configurable primary (`Mod + ↓`) and alternate (`Mod + Shift + ↓`) external program launch commands in settings (disabled by default when empty).

## 1.0.1

- **Fix**: Ensure sort order keybind (`Mod + S`) immediately updates the displayed results in the modal list.
- **Feature**: Automatically set cursor position to the previous subfolder when navigating up to the parent folder (`Mod + ↑`).
- **Fix**: Maintain cursor selection on the current file after changing sort order.
