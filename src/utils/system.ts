import { App, FileSystemAdapter, Notice, Platform, TAbstractFile } from 'obsidian';

/**
 * Reveals a file or folder in the system file explorer (Finder on macOS, File Explorer on Windows, etc.).
 * Uses Obsidian's internal cross-platform method `app.showInFolder` with a fallback to Electron's `shell.showItemInFolder`.
 */
export function revealInSystemExplorer(app: App, file: TAbstractFile): void {
	if (!Platform.isDesktop) {
		new Notice('System explorer is only supported on desktop.');
		return;
	}

	const appWithShow = app as unknown as { showInFolder?: (path: string) => void };
	if (typeof appWithShow.showInFolder === 'function') {
		appWithShow.showInFolder(file.path);
		return;
	}

	if (app.vault.adapter instanceof FileSystemAdapter && typeof window !== 'undefined' && typeof window.require === 'function') {
		const fullPath = app.vault.adapter.getFullPath(file.path);
		try {
			const electron = window.require('electron') as { shell?: { showItemInFolder?: (path: string) => void } };
			if (electron.shell?.showItemInFolder) {
				electron.shell.showItemInFolder(fullPath);
				return;
			}
		} catch {
			// Ignore electron require failure
		}
	}

	new Notice('Unable to reveal item in system explorer.');
}

/**
 * Opens a file or folder with an external program command (e.g., `code`, `code -r`, `subl`).
 */
export function openWithExternalProgram(app: App, file: TAbstractFile, programCommand: string): void {
	const command = programCommand.trim();
	if (!command) {
		return;
	}

	if (!Platform.isDesktop || !(app.vault.adapter instanceof FileSystemAdapter)) {
		new Notice('External application launch is only supported on desktop file systems.');
		return;
	}

	if (typeof window === 'undefined' || typeof window.require !== 'function') {
		new Notice('Desktop runtime environment is missing.');
		return;
	}

	try {
		const childProcess = window.require('child_process') as {
			exec: (cmd: string, callback: (error: Error | null) => void) => void;
		};

		const fullPath = app.vault.adapter.getFullPath(file.path);
		const escapedPath = fullPath.replace(/"/g, '\\"');
		const finalCommand = `${command} "${escapedPath}"`;

		childProcess.exec(finalCommand, (error) => {
			if (error) {
				console.error(`Failed to open item with program command "${finalCommand}":`, error);
				new Notice(`Failed to open with "${command}": ${error.message}`);
			}
		});
	} catch (error) {
		console.error('Failed to load child_process module:', error);
		new Notice('Failed to execute external program.');
	}
}
