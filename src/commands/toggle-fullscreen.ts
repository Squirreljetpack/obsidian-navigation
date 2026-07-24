import { App } from 'obsidian';
import { FolderNavigatorSettings } from '../settings';
import { disableZenMode, enableZenMode, isZenModeActive } from './zen-sidebar';

interface CommandRegistry {
	executeCommandById?: (id: string) => boolean;
}

interface AppWithInternals extends App {
	commands?: CommandRegistry;
}

interface ElectronWindow {
	isFullScreen: () => boolean;
	setFullScreen: (flag: boolean) => void;
}

interface ElectronRemote {
	getCurrentWindow?: () => ElectronWindow;
}

interface ElectronModule {
	remote?: ElectronRemote;
}

interface WindowWithElectron {
	electronWindow?: ElectronWindow;
	require?: (module: string) => unknown;
}

declare const activeWindow: Window | undefined;

/**
 * Retrieves the native Electron BrowserWindow instance if available.
 */
function getElectronWindow(): ElectronWindow | null {
	try {
		const currentWin = typeof activeWindow !== 'undefined' ? activeWindow : window;
		const win = currentWin as unknown as WindowWithElectron;
		if (win.electronWindow) {
			return win.electronWindow;
		}

		const req = win.require;
		if (typeof req === 'function') {
			try {
				const electron = req('electron') as ElectronModule | undefined;
				if (electron?.remote?.getCurrentWindow) {
					return electron.remote.getCurrentWindow();
				}
			} catch {
				// ignore
			}
			try {
				const remote = req('@electron/remote') as ElectronRemote | undefined;
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
	if (electronWin && typeof electronWin.isFullScreen === 'function') {
		return electronWin.isFullScreen();
	}

	const doc = document as Document & {
		webkitFullscreenElement?: Element;
		mozFullScreenElement?: Element;
		msFullscreenElement?: Element;
	};

	if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement) {
		return true;
	}

	if (typeof window !== 'undefined' && typeof screen !== 'undefined') {
		if (window.outerWidth === screen.width && window.outerHeight === screen.height) {
			return true;
		}
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
	if (electronWin && typeof electronWin.setFullScreen === 'function') {
		try {
			electronWin.setFullScreen(true);
			return;
		} catch {
			// Fall back to DOM requestFullscreen below
		}
	}

	const docEl = document.documentElement as HTMLElement & {
		webkitRequestFullscreen?: () => Promise<void>;
		mozRequestFullScreen?: () => Promise<void>;
		msRequestFullscreen?: () => Promise<void>;
	};

	let succeeded = false;
	try {
		if (docEl.requestFullscreen) {
			await docEl.requestFullscreen();
			succeeded = true;
		} else if (docEl.webkitRequestFullscreen) {
			await docEl.webkitRequestFullscreen();
			succeeded = true;
		} else if (docEl.mozRequestFullScreen) {
			await docEl.mozRequestFullScreen();
			succeeded = true;
		} else if (docEl.msRequestFullscreen) {
			await docEl.msRequestFullscreen();
			succeeded = true;
		}
	} catch {
		succeeded = false;
	}

	if (!succeeded) {
		const appWithInternals = app as AppWithInternals;
		if (typeof appWithInternals.commands?.executeCommandById === 'function') {
			appWithInternals.commands.executeCommandById('app:toggle-fullscreen');
		}
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
	if (electronWin && typeof electronWin.setFullScreen === 'function' && electronWin.isFullScreen()) {
		try {
			electronWin.setFullScreen(false);
			return;
		} catch {
			// Fall back to DOM exit below
		}
	}

	const doc = document as Document & {
		webkitFullscreenElement?: Element;
		mozFullScreenElement?: Element;
		msFullscreenElement?: Element;
		webkitExitFullscreen?: () => Promise<void>;
		mozCancelFullScreen?: () => Promise<void>;
		msExitFullscreen?: () => Promise<void>;
	};

	if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement) {
		try {
			if (doc.exitFullscreen) {
				await doc.exitFullscreen();
			} else if (doc.webkitExitFullscreen) {
				await doc.webkitExitFullscreen();
			} else if (doc.mozCancelFullScreen) {
				await doc.mozCancelFullScreen();
			} else if (doc.msExitFullscreen) {
				await doc.msExitFullscreen();
			}
			return;
		} catch {
			// Fall back to command execution below if exitFullscreen throws
		}
	}

	const appWithInternals = app as AppWithInternals;
	if (typeof appWithInternals.commands?.executeCommandById === 'function') {
		appWithInternals.commands.executeCommandById('app:toggle-fullscreen');
	}
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




