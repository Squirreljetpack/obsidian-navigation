import { App } from "obsidian";

/**
 * Checks if Maxymillion's Zen mode plugin is currently active.
 */
export function isZenModeActive(app: App): boolean {
  // Check document.body classes used by Maxymillion's Zen plugin
  if (document.body.classList.contains("is-zen") || document.body.classList.contains("zen")) {
    return true;
  }

  // Check Maxymillion's Zen plugin instance state ('zen' or 'obsidian-zen')
  const plugins = app.plugins?.plugins;
  if (plugins) {
    const zenPlugin = plugins["zen"] ?? plugins["obsidian-zen"];
    if (zenPlugin) {
      return Boolean(zenPlugin.enabled || zenPlugin.active || zenPlugin.header?.active);
    }
  }

  return false;
}

/**
 * Executes Maxymillion's Zen plugin toggle command ('zen:toggle' or 'obsidian-zen:toggle').
 */
function toggleZenCommand(app: App): boolean {
  const commands = app.commands?.commands;
  const execute = app.commands?.executeCommandById;

  if (!commands || !execute) {
    return false;
  }

  const targetId = Object.keys(commands).find(
    (id) => id === "zen:toggle" || id === "obsidian-zen:toggle" || id.startsWith("zen:") || id.startsWith("obsidian-zen:"),
  );

  return targetId ? (execute(targetId) ?? false) : false;
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
    document.body.classList.remove("is-zen", "zen");
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
