# Navigation Tools

Various navigation-related tools for Obsidian.

## Features

- **Fuzzy folder navigator**: Quickly search and navigate your vault folders with a fuzzy finder command palette.
- **Toggle sidebars**: Toggle workspace sidebars (collapsing or restoring left and right sidebars, with Maxymillion-zen compatibility).
- **Toggle fullscreen**: Toggle fullscreen mode in Obsidian while automatically collapsing sidebars on enter and expanding them on exit.
- **System explorer & custom hotkeys**: Reveal items in Finder/Explorer or launch custom external programs directly from the navigator modal.

## Keyboard Shortcuts & Modal Controls

Inside the **Folder Navigator** modal:

| Key | Action |
| --- | --- |
| `Mod + ←` | Navigate up to parent folder in-place |
| `Mod + ↑` | Reveal selected item or current folder in system explorer (Finder / File Explorer) |
| `Mod + S` | Cycle sort order (Name → Accessed/Created → Modified) |
| Custom Hotkeys | Execute configured external program commands |

## Commands

- **Navigation Tools: Open navigator**: Open the quick switcher modal rooted in the active file's parent folder.
- **Navigation Tools: Toggle sidebars**: Toggle workspace sidebars.
- **Navigation Tools: Toggle fullscreen**: Toggle fullscreen mode and sidebar visibility.

## Settings

- **Default sort order**: Configure the default sorting strategy when opening the navigator modal (`Name`, `Accessed / Created time`, `Modified time`).
- **OS path additions**: Define custom `PATH` directory additions for macOS, Windows, and Linux.
- **Custom hotkey commands**: Map hotkeys to shell commands using `{}` as a placeholder for the target file or folder path.

## Installation

### BRAT

Install via BRAT with the repo URL:

```
Squirreljetpack/obsidian-navigation
```

## License

[MIT](LICENSE)

