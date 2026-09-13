import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { SERVER_PRESETS, type ServerPreset, type ShellConfig } from "./config";

const REPO_URL = "https://github.com/MichitoSugawara/tahcode";

export interface MenuHandlers {
  reload: () => void;
  switchServer: (preset: ServerPreset) => void;
}

export function installMenu(config: ShellConfig, getWindow: () => BrowserWindow | null, handlers: MenuHandlers): void {
  const isMac = process.platform === "darwin";

  const serverItems: MenuItemConstructorOptions[] = (Object.keys(SERVER_PRESETS) as ServerPreset[]).map((preset) => ({
    label: SERVER_PRESETS[preset].label,
    type: "radio",
    checked: config.preset === preset,
    enabled: config.preset !== null,
    click: () => handlers.switchServer(preset),
  }));
  if (config.preset === null) {
    serverItems.push({ type: "separator" }, { label: `Custom: ${config.appUrl}`, enabled: false });
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: handlers.reload },
        {
          label: "Back",
          accelerator: isMac ? "Cmd+[" : "Alt+Left",
          click: () => {
            const nav = getWindow()?.webContents.navigationHistory;
            if (nav?.canGoBack()) nav.goBack();
          },
        },
        {
          label: "Forward",
          accelerator: isMac ? "Cmd+]" : "Alt+Right",
          click: () => {
            const nav = getWindow()?.webContents.navigationHistory;
            if (nav?.canGoForward()) nav.goForward();
          },
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Server",
      submenu: [
        ...serverItems,
        { type: "separator" },
        { label: "Open Current Page in Browser", click: () => void openCurrentInBrowser(getWindow(), config) },
      ],
    },
    {
      label: "Window",
      submenu: isMac
        ? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }, { type: "separator" }, { role: "window" }]
        : [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
    },
    {
      role: "help",
      submenu: [
        { label: "tahcode Web", click: () => void shell.openExternal(SERVER_PRESETS.production.url) },
        { label: "Source on GitHub", click: () => void shell.openExternal(REPO_URL) },
        { type: "separator" },
        { label: `Version ${app.getVersion()}`, enabled: false },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openCurrentInBrowser(win: BrowserWindow | null, config: ShellConfig): Promise<void> {
  const current = win?.webContents.getURL();
  const target = current && current.startsWith(config.appUrl) ? current : config.appUrl;
  await shell.openExternal(target);
}
