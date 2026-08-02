import type { App } from "obsidian";

/**
 * The manifest id of Maxymillion's Zen plugin (used as the plugin instance key
 * on app.plugins.plugins).
 */
export const ZEN_PLUGIN_ID = "zen";

/**
 * The command id registered by Maxymillion's Zen plugin for toggling zen mode.
 */
export const ZEN_TOGGLE_COMMAND_ID = "zen:toggle";

/**
 * Checks if Maxymillion's Zen mode plugin is currently active.
 *
 * Zen stores its active state in `plugin.settings.enabled` (a boolean toggled
 * by the 'zen:toggle' command / the ZenView header). When enabled it also adds
 * the `zen-enabled` class to document.body. We use the plugin state as the
 * source of truth and the body class as a fallback in case the plugin instance
 * isn't reachable (e.g. while its view is still initialising).
 */
export function isZenModeActive(app: App): boolean {
	const zenPlugin = app.plugins?.plugins?.[ZEN_PLUGIN_ID];
	if (zenPlugin?.settings) {
		return zenPlugin.settings.enabled === true;
	}

	return document.body.classList.contains("zen-enabled");
}

/**
 * Executes Maxymillion's Zen plugin toggle command ('zen:toggle').
 *
 * Note: the call must go through `app.commands?.executeCommandById?.(...)`
 * (optional chaining) rather than extracting the method into a local variable
 * and invoking it detached — Obsidian's implementation uses `this.findCommand`
 * internally, so an unbound call throws "Cannot read properties of undefined".
 */
function toggleZenCommand(app: App): boolean {
	return app.commands?.executeCommandById?.(ZEN_TOGGLE_COMMAND_ID) ?? false;
}

/**
 * Enables Maxymillion's Zen mode if not currently active.
 */
export function enableZenMode(app: App): void {
	if (!isZenModeActive(app)) {
		toggleZenCommand(app);
	}
}

/**
 * Disables Maxymillion's Zen mode if active.
 */
export function disableZenMode(app: App): void {
	if (isZenModeActive(app)) {
		toggleZenCommand(app);
	}
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
 * Combined handler: If in Zen mode, disables Zen mode and opens both sidebars.
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
