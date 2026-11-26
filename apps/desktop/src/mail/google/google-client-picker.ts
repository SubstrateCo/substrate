import { readGoogleClientFile } from "./google-client.ts";
import { app, BrowserWindow, dialog, type OpenDialogOptions } from "electron";

/** User-initiated native selection only. Neither a filename nor the contents crosses the bridge. */
export async function pickGoogleClient(signal: AbortSignal) {
  signal.throwIfAborted();
  const window = BrowserWindow.getFocusedWindow();
  const options: OpenDialogOptions = {
    title: "Choose your Google Desktop app OAuth JSON",
    buttonLabel: "Use client",
    defaultPath: app.getPath("downloads"),
    properties: ["openFile"],
    filters: [{ name: "Google OAuth client JSON", extensions: ["json"] }],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  signal.throwIfAborted();
  const selected = result.filePaths.at(0);
  if (result.canceled || !selected) return null;
  return readGoogleClientFile(selected);
}
