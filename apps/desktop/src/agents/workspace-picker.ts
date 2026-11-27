import { app, BrowserWindow, dialog, type OpenDialogOptions } from "electron";

/** User-initiated native selection only. The renderer never names a path. */
export async function pickWorkspace(): Promise<string | null> {
  const window = BrowserWindow.getFocusedWindow();
  const options: OpenDialogOptions = {
    title: "Choose the agent's working folder",
    buttonLabel: "Use folder",
    defaultPath: app.getPath("home"),
    properties: ["openDirectory"],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  const selected = result.filePaths.at(0);
  return result.canceled || !selected ? null : selected;
}
