import { App, FileSystemAdapter, Notice, Platform, TAbstractFile } from 'obsidian';
import { FolderNavigatorSettings } from '../settings';

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
 * Retrieves the OS-specific PATH addition string from settings.
 */
function getOsPathAdditions(settings: FolderNavigatorSettings): string {
	if (Platform.isMacOS) {
		return settings.macosPath || '';
	}
	if (Platform.isWin) {
		return settings.windowsPath || '';
	}
	return settings.linuxPath || '';
}

/**
 * Builds the environment object with expanded PATH additions.
 */
function buildExecEnvironment(settings: FolderNavigatorSettings): Record<string, string | undefined> {
	const additions = getOsPathAdditions(settings).trim();
	const winWithProc = window as unknown as { process?: { env?: Record<string, string | undefined> } };
	const sysEnv = winWithProc.process?.env ?? {};

	if (!additions) {
		return { ...sysEnv };
	}

	const homeDir = sysEnv.HOME || sysEnv.USERPROFILE || '';
	const expandedAdditions = additions.replace(/~/g, homeDir);
	const pathDelimiter = Platform.isWin ? ';' : ':';
	const existingPath = sysEnv.PATH || '';

	const combinedPath = existingPath
		? `${expandedAdditions}${pathDelimiter}${existingPath}`
		: expandedAdditions;

	return {
		...sysEnv,
		PATH: combinedPath,
	};
}

/**
 * Opens a file or folder with an external program command template (e.g. `code`, `subl {}`).
 * Supports `{}` template variable and OS-specific PATH additions.
 */
export function openWithExternalProgram(
	app: App,
	file: TAbstractFile,
	commandTemplate: string,
	settings: FolderNavigatorSettings,
): void {
	const command = commandTemplate.trim();
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
			exec: (
				cmd: string,
				options: { env: Record<string, string | undefined> },
				callback: (error: Error | null) => void,
			) => void;
		};

		const fullPath = app.vault.adapter.getFullPath(file.path);
		const escapedPath = fullPath.replace(/"/g, '\\"');

		let finalCommand: string;
		if (command.includes('{}')) {
			finalCommand = command.replace(/{}/g, `"${escapedPath}"`);
		} else if (command.includes('{file}')) {
			finalCommand = command.replace(/{file}/g, `"${escapedPath}"`);
		} else {
			finalCommand = `${command} "${escapedPath}"`;
		}

		const env = buildExecEnvironment(settings);

		childProcess.exec(finalCommand, { env }, (error) => {
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
