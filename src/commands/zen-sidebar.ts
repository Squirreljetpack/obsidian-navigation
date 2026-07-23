import { App } from 'obsidian';

interface CommandInfo {
	id: string;
	name?: string;
}

interface CommandRegistry {
	commands?: Record<string, CommandInfo>;
	executeCommandById?: (id: string) => boolean;
}

interface PluginInstance {
	enabled?: boolean;
	active?: boolean;
	zen?: boolean;
	isZen?: boolean;
	isZenMode?: boolean;
	header?: { active?: boolean };
}

interface PluginRegistry {
	plugins?: Record<string, PluginInstance>;
}

interface AppWithInternals extends App {
	plugins?: PluginRegistry;
	commands?: CommandRegistry;
}

/**
 * Checks if Zen mode (supporting Maxymillion's Zen plugin as well as paperbenni's) is currently active.
 */
export function isZenModeActive(app: App): boolean {
	// 1. Check document.body classes for any class containing 'zen'
	const bodyClasses = Array.from(document.body.classList);
	if (bodyClasses.some((cls) => cls.toLowerCase().includes('zen'))) {
		return true;
	}

	// 2. Check plugin instance states for 'zen' or 'obsidian-zen'
	const appWithInternals = app as AppWithInternals;
	const plugins = appWithInternals.plugins?.plugins;
	if (plugins) {
		for (const pluginId of Object.keys(plugins)) {
			if (pluginId.toLowerCase() === 'zen' || pluginId.toLowerCase().includes('zen')) {
				const plugin = plugins[pluginId];
				if (
					plugin &&
					(plugin.enabled === true ||
						plugin.active === true ||
						plugin.zen === true ||
						plugin.isZen === true ||
						plugin.isZenMode === true ||
						plugin.header?.active === true)
				) {
					return true;
				}
			}
		}
	}

	return false;
}

/**
 * Disables Zen mode if active by triggering the Zen plugin's toggle command
 * (e.g. Maxymillion's 'zen:toggle' or 'obsidian-zen:toggle').
 */
export function disableZenMode(app: App): void {
	if (!isZenModeActive(app)) {
		return;
	}

	const appWithInternals = app as AppWithInternals;
	const commands = appWithInternals.commands?.commands;
	if (commands) {
		const zenCommandId = Object.keys(commands).find((id) => {
			const cmd = commands[id];
			const name = (cmd?.name || '').toLowerCase();
			const idLower = id.toLowerCase();
			return (
				idLower.startsWith('zen:') ||
				idLower.startsWith('obsidian-zen:') ||
				idLower.startsWith('zen-mode:') ||
				((idLower.includes('zen') || name.includes('zen')) &&
					(name.includes('toggle') || idLower.includes('toggle') || name.includes('exit') || idLower.includes('exit')))
			);
		});

		if (zenCommandId && typeof appWithInternals.commands?.executeCommandById === 'function') {
			appWithInternals.commands.executeCommandById(zenCommandId);
		}
	}

	const bodyClasses = Array.from(document.body.classList);
	bodyClasses.forEach((cls) => {
		if (cls.toLowerCase().includes('zen')) {
			document.body.classList.remove(cls);
		}
	});
}

/**
 * Toggles workspace sidebars:
 * If both left and right sidebars are enabled (open), close both.
 * Otherwise, open both.
 */
export function toggleSidebars(app: App): void {
	const leftSplit = app.workspace.leftSplit;
	const rightSplit = app.workspace.rightSplit;

	if (!leftSplit || !rightSplit) {
		return;
	}

	const isLeftOpen = !leftSplit.collapsed;
	const isRightOpen = !rightSplit.collapsed;

	if (isLeftOpen && isRightOpen) {
		leftSplit.collapse();
		rightSplit.collapse();
	} else {
		leftSplit.expand();
		rightSplit.expand();
	}
}

/**
 * Combined handler: If in Zen mode, disables Zen mode and enables (opens) both sidebars.
 * Otherwise, performs a standard sidebar toggle.
 */
export function disableZenAndToggleSidebars(app: App): void {
	const wasZenActive = isZenModeActive(app);

	if (wasZenActive) {
		disableZenMode(app);
		const leftSplit = app.workspace.leftSplit;
		const rightSplit = app.workspace.rightSplit;
		if (leftSplit) leftSplit.expand();
		if (rightSplit) rightSplit.expand();
	} else {
		toggleSidebars(app);
	}
}
