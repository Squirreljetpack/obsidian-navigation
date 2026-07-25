import { App, WorkspaceLeaf } from 'obsidian';

interface WorkspaceWithInternals {
	rightSplit?: unknown;
}

/**
 * Closes (detaches) all leaves/views currently located in the right sidebar.
 */
export function closeRightSidebarViews(app: App): void {
	const rightSplit = (app.workspace as WorkspaceWithInternals).rightSplit;
	if (!rightSplit) {
		return;
	}

	const leavesToClose: WorkspaceLeaf[] = [];

	app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
		if (typeof leaf.getRoot === 'function' && leaf.getRoot() === rightSplit) {
			leavesToClose.push(leaf);
		}
	});

	for (const leaf of leavesToClose) {
		leaf.detach();
	}
}
