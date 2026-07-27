import { App, WorkspaceLeaf } from 'obsidian';

/**
 * Closes (detaches) all leaves/views currently located in the right sidebar.
 */
export function closeRightSidebarViews(app: App): void {
	const rightSplit = app.workspace.rightSplit;
	if (!rightSplit) {
		return;
	}

	const leavesToClose: WorkspaceLeaf[] = [];

	app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
		if (leaf.getRoot() === rightSplit) {
			leavesToClose.push(leaf);
		}
	});

	for (const leaf of leavesToClose) {
		leaf.detach();
	}
}
