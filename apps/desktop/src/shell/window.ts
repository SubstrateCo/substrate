import { bundledApplicationURL, navigationTarget } from "./navigation.ts";
import { attachTitleBar, titleBarOptions } from "./title-bar.ts";
import { BrowserWindow, shell, type Session } from "electron";

export function createShellWindow(options: {
  name: string;
  icon: string;
  production: boolean;
  rendererURL: string;
  partition: string;
  preload: string;
  startHidden: boolean;
  errorPageURL: string;
  errorPage: string;
  shouldHide(): boolean;
  onClosed(): void;
  onNavigation(): void;
}) {
  const target = (url: string) => navigationTarget(url, options.rendererURL);
  const openExternal = (url: string) => {
    if (target(url) === "external") void shell.openExternal(url).catch(console.error);
  };
  const window = new BrowserWindow({
    title: options.name,
    icon: options.icon,
    width: 1440,
    height: 960,
    minWidth: 320,
    minHeight: 568,
    show: false,
    ...titleBarOptions(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      partition: options.partition,
      preload: options.preload,
      additionalArguments: [
        `--substrate-origin=${options.rendererURL}`,
        ...(options.production ? ["--substrate-production"] : []),
      ],
    },
  });
  attachTitleBar(window, options.rendererURL);
  window.on("page-title-updated", (event, title) => {
    event.preventDefault();
    window.setTitle(title && title !== "Substrate" ? `${title} — ${options.name}` : options.name);
  });
  window.setMenuBarVisibility(false);
  window.once("ready-to-show", () => {
    if (!options.startHidden) window.show();
  });
  window.on("close", (event) => {
    if (!options.shouldHide()) return;
    event.preventDefault();
    window.hide();
  });
  window.on("closed", () => options.onClosed());
  window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) options.onNavigation();
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (
      url === `${bundledApplicationURL}/` &&
      window.webContents.getURL() === options.errorPageURL
    ) {
      event.preventDefault();
      void window.loadURL(options.rendererURL).catch(console.error);
      return;
    }
    if (target(url) !== "internal") {
      event.preventDefault();
      openExternal(url);
    }
  });
  window.webContents.on("will-redirect", (event, url) => {
    if (target(url) !== "internal") event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (target(url) === "internal") void window.loadURL(url).catch(console.error);
    else openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && target(url) === "internal")
      void window.loadFile(options.errorPage).catch(console.error);
  });
  return window;
}

export function configurePermissions(
  desktopSession: Session,
  getWindow: () => BrowserWindow | undefined,
  rendererURL: string,
) {
  const internal = (url: string) => navigationTarget(url, rendererURL) === "internal";
  desktopSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(
      permission === "clipboard-sanitized-write" &&
        details.isMainFrame &&
        contents === getWindow()?.webContents &&
        internal(details.requestingUrl),
    );
  });
  desktopSession.setPermissionCheckHandler(
    (contents, permission, origin) =>
      permission === "clipboard-sanitized-write" &&
      contents === getWindow()?.webContents &&
      internal(origin),
  );
}
