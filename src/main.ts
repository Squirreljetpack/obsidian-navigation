import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, FolderNavigatorSettings, FolderNavigatorSettingTab } from "./settings.js";
import { FolderNavigatorModal } from "./ui/folder-navigator-modal.js";

import { closeRightSidebarViews } from "./commands/close-right-sidebar-views.js";
import { linkSearcher } from "./commands/show-links.js";
import { toggleFullscreen } from "./commands/toggle-fullscreen.js";
import { disableZenAndToggleSidebars } from "./commands/zen-sidebar.js";
import { MouseWheelZoomManager } from "./utils/mousewheel-zoom.js";

export default class FolderNavigatorPlugin extends Plugin {
  settings!: FolderNavigatorSettings;
  private mouseWheelZoomManager!: MouseWheelZoomManager;

  async onload() {
    await this.loadSettings();

    this.mouseWheelZoomManager = new MouseWheelZoomManager(this, () => this.settings);
    this.mouseWheelZoomManager.setup();

    // Register the command that appears in the standard Obsidian Command Palette
    const openModal = () => {
      const initialItem = this.app.workspace.getActiveFile() ?? this.app.vault.getRoot();
      new FolderNavigatorModal(this.app, this.settings, initialItem).open();
    };

    this.addCommand({
      id: "open-navigator",
      name: "Open navigator",
      callback: openModal,
    });

    this.addCommand({
      id: "link-searcher",
      name: "Link searcher",
      callback: () => {
        linkSearcher(this.app);
      },
    });

    this.addCommand({
      id: "toggle-sidebars",
      name: "Toggle sidebars",
      callback: () => {
        disableZenAndToggleSidebars(this.app);
      },
    });

    this.addCommand({
      id: "toggle-fullscreen",
      name: "Toggle fullscreen",
      callback: () => {
        void toggleFullscreen(this.app, this.settings);
      },
    });

    this.addCommand({
      id: "close-right-sidebar-views",
      name: "Close all views in right sidebar",
      callback: () => {
        closeRightSidebarViews(this.app);
      },
    });

    this.addSettingTab(new FolderNavigatorSettingTab(this.app, this));
  }

  onunload() {
    this.mouseWheelZoomManager?.onunload();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<FolderNavigatorSettings>);
    if (!this.settings.customCommands) {
      this.settings.customCommands = [];
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
