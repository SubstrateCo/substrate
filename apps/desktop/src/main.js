import { desktopScheme, resolveDesktopLink } from "@startup-os/contracts/desktop/links";
import { realtimeChannel } from "@startup-os/contracts/realtime";

import { createDesktopAuthClient } from "./auth/auth-client.js";
import {
  harnessChannel,
  harnessEventChannel,
  localHarnessMethods,
  trustedHarnessSender,
} from "./harness/harness-bridge.ts";
import { createHarnessController } from "./harness/harness-controller.ts";
import { createHarnessProcess } from "./harness/harness-process.ts";
import { applicationURL, bundledApplicationURL, navigationTarget } from "./shell/navigation.js";
import { attachTitleBar, titleBarOptions } from "./shell/title-bar.ts";
import { desktopAPITransport } from "./transport/api-transport.js";
import { backendURL, bundledRenderer } from "./transport/bundled-renderer.js";
import { createRealtimeController } from "./transport/realtime-controller.ts";
import { emitRealtimeUpdate } from "./transport/realtime-events.ts";
import { storageOrigins, storageRequest } from "./transport/storage.js";
import { app, BrowserWindow, ipcMain, Menu, net, session, shell } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bundled = app.isPackaged || app.commandLine.hasSwitch("bundled-renderer");
const rendererURL = bundled ? bundledApplicationURL : applicationURL;
/** @param {string} url */
const target = (url) => navigationTarget(url, rendererURL);

const errorPageURL = new URL(
  app.isPackaged ? "./offline.html" : "./shell/offline.html",
  import.meta.url,
).href;
const errorPage = fileURLToPath(errorPageURL);
app.setName("Startup OS");
// Keep the lock identity stable for package, source-file, and smoke-test launches.
const testID = app.commandLine.hasSwitch("desktop-smoke-test")
  ? process.env.STARTUP_OS_TEST_ID
  : undefined;
if (testID && !/^[a-zA-Z0-9-]+$/.test(testID)) throw new Error("Invalid desktop test ID.");
app.setPath(
  "userData",
  join(app.getPath("appData"), "Startup OS", ...(testID ? ["tests", testID] : [])),
);
const sessionPartition = app.commandLine.hasSwitch("desktop-smoke-test")
  ? "startup-os-smoke-test"
  : "persist:startup-os";
const publicConfig = app.isPackaged
  ? JSON.parse(readFileSync(new URL("./desktop-config.json", import.meta.url), "utf8"))
  : {};
const backend = backendURL(process.env.STARTUP_OS_API_URL ?? publicConfig.apiURL, app.isPackaged);
const allowedStorageOrigins = storageOrigins(
  process.env.STARTUP_OS_STORAGE_ORIGINS ?? publicConfig.storageOrigins,
  app.isPackaged,
);
/** @type {ReturnType<typeof createHarnessController> | undefined} */
let harness;
/** @type {ReturnType<typeof createRealtimeController> | undefined} */
let realtime;
const { authClient, handleAuthLink } = createDesktopAuthClient(
  backend,
  process.env.STARTUP_OS_WEB_URL ?? publicConfig.webURL ?? applicationURL,
  app.commandLine.hasSwitch("desktop-smoke-test"),
  () => mainWindow,
  () => {
    harness?.disconnect();
    realtime?.disconnect();
  },
  () => {
    harness?.disconnect();
    realtime?.disconnect();
    const contents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : undefined;
    if (contents && !contents.isDestroyed() && target(contents.getURL()) === "internal")
      contents.reload();
  },
);
/** @type {BrowserWindow | undefined} */
let mainWindow;
/** @type {string[]} */
const pendingDestinations = [];

/** @param {string[]} values */
function acceptLinks(values) {
  for (const value of values) {
    const destination = resolveDesktopLink(value, rendererURL);
    if (destination) pendingDestinations.push(destination);
    else
      void handleAuthLink(value).catch(() => {
        mainWindow?.webContents.send("better-auth:error", {
          message: "Could not complete sign-in. Please try again.",
          path: "/auth/callback",
        });
      });
  }
  navigatePending();
}

function navigatePending() {
  if (!mainWindow || !pendingDestinations.length) return;
  // A full navigation refreshes session and workspace context for the destination.
  const destination = pendingDestinations.pop();
  pendingDestinations.length = 0;
  if (destination) void mainWindow.loadURL(destination).catch(() => {});
}

acceptLinks(process.argv);
app.on("open-url", (event, url) => {
  event.preventDefault();
  acceptLinks([url]);
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
});

/** @param {string} url */
function openExternal(url) {
  if (target(url) === "external") {
    void shell.openExternal(url).catch(console.error);
  }
}

function createWindow() {
  const window = new BrowserWindow({
    title: "Startup OS",
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
      partition: sessionPartition,
      preload: fileURLToPath(
        new URL(app.isPackaged ? "./preload.cjs" : "../.runtime/preload.cjs", import.meta.url),
      ),
      additionalArguments: [`--startup-os-origin=${rendererURL}`],
    },
  });
  mainWindow = window;
  attachTitleBar(window, rendererURL);
  window.setMenuBarVisibility(false);
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    realtime?.disconnect();
    harness?.disconnect();
    mainWindow = undefined;
  });
  window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) realtime?.disconnect();
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url === `${bundledApplicationURL}/` && window.webContents.getURL() === errorPageURL) {
      event.preventDefault();
      void window.loadURL(rendererURL).catch(() => {});
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
    if (target(url) === "internal") {
      void window.loadURL(url).catch(console.error);
    } else {
      openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && target(url) === "internal") {
      void window.loadFile(errorPage).catch(console.error);
    }
  });
  if (pendingDestinations.length) navigatePending();
  else void window.loadURL(rendererURL).catch(console.error);
}

if (!app.requestSingleInstanceLock()) {
  console.log("Startup OS is already running. Focusing the existing window.");
  app.quit();
} else {
  // One dispatcher owns workspace links and auth callbacks. Better Auth owns PKCE and exchange.
  authClient.setupMain({ getWindow: () => mainWindow, scheme: false, bridges: true, csp: false });
  if (!app.commandLine.hasSwitch("desktop-smoke-test")) {
    if (process.defaultApp)
      app.setAsDefaultProtocolClient(desktopScheme, process.execPath, [
        fileURLToPath(import.meta.url),
      ]);
    else app.setAsDefaultProtocolClient(desktopScheme);
  }
  app.on("second-instance", (_event, argv) => {
    acceptLinks(argv);
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  void app
    .whenReady()
    .then(() => {
      const desktopSession = session.fromPartition(sessionPartition);
      realtime = createRealtimeController({
        backend,
        getCookie: () => authClient.getCookie(),
        emit: (event) => emitRealtimeUpdate(mainWindow, event, rendererURL),
      });
      ipcMain.handle(realtimeChannel, (event, method, value) => {
        if (!trustedHarnessSender(event, mainWindow?.webContents, rendererURL))
          throw new Error("Realtime unavailable.");
        if (method === "connect") return realtime?.connect(value);
        if (method === "disconnect" && value === undefined) return realtime?.disconnect();
        throw new Error("Invalid realtime operation.");
      });
      app.on("before-quit", () => realtime?.disconnect());
      const fetchAPI = desktopAPITransport({
        getCookie: () => authClient.getCookie(),
        authFetch: (path, options) => authClient.$fetch(path, options),
      });
      harness = createHarnessController({
        backend,
        accountsDirectory: join(app.getPath("userData"), "accounts"),
        fetchAPI,
        createWorker: (directory) =>
          createHarnessProcess(
            fileURLToPath(
              new URL(
                app.isPackaged ? "./harness-worker.js" : "../.runtime/harness-worker.js",
                import.meta.url,
              ),
            ),
            directory,
            (event) => {
              const contents = mainWindow?.webContents;
              if (contents && target(contents.getURL()) === "internal")
                contents.send(harnessEventChannel, event);
            },
          ),
      });
      ipcMain.handle(harnessChannel, (event, method, value) => {
        if (!trustedHarnessSender(event, mainWindow?.webContents, rendererURL))
          throw new Error("Harness unavailable.");
        if (method === "disconnect" && value === undefined) {
          harness?.disconnect();
          return;
        }
        if (!["status", "synchronize", "execute", ...localHarnessMethods].includes(method))
          throw new Error("Invalid harness operation.");
        if ((method === "status" || method === "synchronize") && value !== undefined)
          throw new Error("Invalid harness operation.");
        return harness?.run(method, value);
      });
      app.on("before-quit", () => harness?.disconnect());
      const fetchStorage = storageRequest(allowedStorageOrigins, (request, options) =>
        desktopSession.fetch(request, { ...options, bypassCustomProtocolHandlers: true }),
      );
      if (bundled) {
        const serveRenderer = bundledRenderer({
          directory: fileURLToPath(
            new URL(app.isPackaged ? "./renderer/" : "../../web/dist/", import.meta.url),
          ),
          backend,
          fetchUpstream: fetchAPI,
          fetchFile: (url) => net.fetch(url),
          storageOrigins: allowedStorageOrigins,
        });
        // Direct storage traffic must never enter the authenticated API proxy.
        for (const scheme of ["https", "http"]) {
          desktopSession.protocol.handle(scheme, (request) =>
            new URL(request.url).origin === rendererURL
              ? serveRenderer(request)
              : fetchStorage(request),
          );
        }
      } else {
        const serveAPI = bundledRenderer({
          directory: ".",
          backend,
          fetchFile: (url) => net.fetch(url),
          fetchUpstream: fetchAPI,
          origin: rendererURL,
        });
        /** @param {Request} request */
        const serveDevelopment = (request) => {
          const url = new URL(request.url);
          if (
            url.origin === rendererURL &&
            (url.pathname === "/api" || url.pathname.startsWith("/api/"))
          )
            return serveAPI(request);
          if (allowedStorageOrigins.includes(url.origin)) return fetchStorage(request);
          return net.fetch(request, { bypassCustomProtocolHandlers: true });
        };
        for (const scheme of new Set([
          new URL(rendererURL).protocol.slice(0, -1),
          ...allowedStorageOrigins.map((value) => new URL(value).protocol.slice(0, -1)),
        ]))
          desktopSession.protocol.handle(scheme, serveDevelopment);
      }
      desktopSession.setPermissionRequestHandler((contents, permission, callback, details) => {
        callback(
          permission === "clipboard-sanitized-write" &&
            details.isMainFrame &&
            contents === mainWindow?.webContents &&
            target(details.requestingUrl) === "internal",
        );
      });
      desktopSession.setPermissionCheckHandler((contents, permission, origin) => {
        return (
          permission === "clipboard-sanitized-write" &&
          contents === mainWindow?.webContents &&
          target(origin) === "internal"
        );
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === "darwin" ? [{ role: /** @type {const} */ ("appMenu") }] : []),
          { role: "fileMenu" },
          { role: "editMenu" },
          { role: "viewMenu" },
          { role: "windowMenu" },
        ]),
      );
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
}
