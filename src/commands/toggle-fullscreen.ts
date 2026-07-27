import { App } from "obsidian";
import { FolderNavigatorSettings } from "../settings.js";
import { disableZenMode, enableZenMode, isZenModeActive } from "./zen-sidebar.js";

interface ElectronWindow {
  isFullScreen: () => boolean;
  setFullScreen: (flag: boolean) => void;
}

declare const activeWindow: Window | undefined;

/**
 * Retrieves the native Electron BrowserWindow instance if available.
 */
function getElectronWindow(): ElectronWindow | null {
  try {
    const currentWin = (activeWindow ?? window) as typeof window & {
      electronWindow?: ElectronWindow;
      require?: (module: string) => {
        remote?: { getCurrentWindow?: () => ElectronWindow };
      };
    };

    if (currentWin.electronWindow) {
      return currentWin.electronWindow;
    }

    if (currentWin.require) {
      try {
        const electron = currentWin.require("electron") as { remote?: { getCurrentWindow?: () => ElectronWindow } };
        if (electron?.remote?.getCurrentWindow) {
          return electron.remote.getCurrentWindow();
        }
      } catch {
        // ignore
      }
      try {
        const remote = currentWin.require("@electron/remote") as { getCurrentWindow?: () => ElectronWindow };
        if (remote?.getCurrentWindow) {
          return remote.getCurrentWindow();
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // Non-electron environment (e.g. mobile or web)
  }
  return null;
}

/**
 * Checks if the application or document is currently in fullscreen mode.
 */
export function isFullscreen(): boolean {
  const electronWin = getElectronWindow();
  if (electronWin?.isFullScreen?.()) {
    return true;
  }

  if (document.fullscreenElement) {
    return true;
  }

  if (window.outerWidth === screen.width && window.outerHeight === screen.height) {
    return true;
  }

  return false;
}

/**
 * Hides (collapses) both the left and right sidebars.
 */
export function hideSidebars(app: App): void {
  if (app.workspace.leftSplit) {
    app.workspace.leftSplit.collapse();
  }
  if (app.workspace.rightSplit) {
    app.workspace.rightSplit.collapse();
  }
}

/**
 * Shows (expands) both the left and right sidebars.
 */
export function showSidebars(app: App): void {
  if (app.workspace.leftSplit) {
    app.workspace.leftSplit.expand();
  }
  if (app.workspace.rightSplit) {
    app.workspace.rightSplit.expand();
  }
}

/**
 * Enters fullscreen mode.
 */
export async function enterFullscreen(app: App): Promise<void> {
  if (isFullscreen()) {
    return;
  }

  const electronWin = getElectronWindow();
  if (electronWin?.setFullScreen) {
    try {
      electronWin.setFullScreen(true);
      return;
    } catch {
      // Fall back to DOM requestFullscreen below
    }
  }

  let succeeded = false;
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
      succeeded = true;
    }
  } catch {
    succeeded = false;
  }

  if (!succeeded) {
    app.commands?.executeCommandById?.("app:toggle-fullscreen");
  }
}

/**
 * Exits fullscreen mode.
 */
export async function exitFullscreen(app: App): Promise<void> {
  if (!isFullscreen()) {
    return;
  }

  const electronWin = getElectronWindow();
  if (electronWin?.setFullScreen && electronWin.isFullScreen()) {
    try {
      electronWin.setFullScreen(false);
      return;
    } catch {
      // Fall back to DOM exit below
    }
  }

  if (document.fullscreenElement) {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
      return;
    } catch {
      // Fall back to command execution below if exitFullscreen throws
    }
  }

  app.commands?.executeCommandById?.("app:toggle-fullscreen");
}

/**
 * Toggles fullscreen:
 * If not in fullscreen: enter fullscreen, hide both sidebars, and optionally enter Zen mode if configured.
 * Otherwise: exit fullscreen, disable Zen mode if active (before showing sidebars), and show both sidebars.
 */
export async function toggleFullscreen(app: App, settings?: FolderNavigatorSettings): Promise<void> {
  if (!isFullscreen()) {
    await enterFullscreen(app);
    hideSidebars(app);
    if (settings?.enterZenOnFullscreen) {
      enableZenMode(app);
    }
  } else {
    await exitFullscreen(app);
    if (isZenModeActive(app)) {
      disableZenMode(app);
    }
    showSidebars(app);
  }
}
