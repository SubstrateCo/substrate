import { agentWorkChangeChannel, agentWorkChannel } from "@startup-os/contracts/agent-work/desktop";
import { desktopScheme, resolveDesktopLink } from "@startup-os/contracts/desktop/links";
import { desktopSettingsChannel } from "@startup-os/contracts/desktop/window";
import { realtimeChannel, realtimeEventChannel } from "@startup-os/contracts/realtime";

import { installationId } from "./agents/installation.ts";
import { createAgentWorkService } from "./agents/service.ts";
import { observeMcpCalls } from "./agents/turns/mcp-observer.ts";
import { createDesktopAuthClient } from "./auth/auth-client.js";
import { harnessChannel } from "./harness/bridge/harness-bridge.ts";
import { createHarnessController } from "./harness/controller/harness-controller.ts";
import { createHarnessProcess } from "./harness/worker/harness-process.ts";
import { applicationURL, bundledApplicationURL, navigationTarget } from "./shell/navigation.js";
import { attachTitleBar, titleBarOptions } from "./shell/title-bar.ts";
import { trustedSender } from "./shell/trusted-sender.ts";
import { desktopAPITransport } from "./transport/api-transport.js";
import { backendURL, bundledRenderer } from "./transport/bundled-renderer.js";
import { createRealtimeController } from "./transport/realtime-controller.ts";
import { emitToRenderer } from "./transport/realtime-events.ts";
import { storageOrigins, storageRequest } from "./transport/storage.js";
import { app, BrowserWindow, ipcMain, Menu, net, session, shell, Tray } from "electron";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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
// Signed uploads go to the server's storage endpoint. A packaged app uses the origin from its
// build, so an unrelated S3_ENDPOINT on the machine cannot widen it.
const allowedStorageOrigins = storageOrigins(
  app.isPackaged
    ? publicConfig.storageOrigins
    : process.env.S3_ENDPOINT
      ? new URL(process.env.S3_ENDPOINT).origin
      : undefined,
  app.isPackaged,
);
/** @type {ReturnType<typeof createHarnessController> | undefined} */
let harness;
/** @type {ReturnType<typeof createRealtimeController> | undefined} */
let realtime;
/** @type {ReturnType<typeof createAgentWorkService> | undefined} */
let agentWork;
/** @type {Tray | undefined} */
let tray;
const smokeTest = app.commandLine.hasSwitch("desktop-smoke-test");
// Closing the window hides it so agents keep running. Quit from the tray or the app menu.
let quitting = false;
// A login launch starts in the tray.
const loginArguments = ["--hidden"];
const startHidden = process.argv.includes("--hidden");
const { authClient, handleAuthLink } = createDesktopAuthClient(
  backend,
  process.env.STARTUP_OS_WEB_URL ?? publicConfig.webURL ?? applicationURL,
  app.commandLine.hasSwitch("desktop-smoke-test"),
  () => mainWindow,
  () => {
    agentWork?.stop();
    harness?.disconnect();
    realtime?.disconnect();
  },
  () => {
    agentWork?.stop();
    harness?.disconnect();
    realtime?.disconnect();
    if (!smokeTest) agentWork?.start();
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
  window.once("ready-to-show", () => {
    if (!startHidden || smokeTest) window.show();
  });
  // The hidden window keeps the renderer and its realtime connection alive for agent runs.
  window.on("close", (event) => {
    if (quitting || smokeTest) return;
    event.preventDefault();
    window.hide();
  });
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

function showWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
}

// The tray keeps the app reachable while its window is hidden and agents run.
async function createTray() {
  const icon = await app.getFileIcon(process.execPath, { size: "small" });
  tray = new Tray(icon);
  tray.setToolTip("Startup OS");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Startup OS", click: showWindow },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("click", showWindow);
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
    showWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => {
    quitting = true;
    agentWork?.stop();
  });
  void app
    .whenReady()
    .then(() => {
      const desktopSession = session.fromPartition(sessionPartition);
      const installation = installationId(app.getPath("userData"));
      realtime = createRealtimeController({
        backend,
        getCookie: () => authClient.getCookie(),
        emit: (event) => {
          emitToRenderer(mainWindow, realtimeEventChannel, event, rendererURL);
          if (
            event.type === "change" &&
            (event.domain === "session" ||
              event.domain === "access" ||
              event.domain === "organization")
          )
            harness?.refreshAuthority();
          agentWork?.onRealtime(event);
        },
      });
      ipcMain.handle(realtimeChannel, (event, method, value) => {
        if (!trustedSender(event, mainWindow?.webContents, rendererURL))
          throw new Error("Realtime unavailable.");
        if (method === "connect") return realtime?.connect(value);
        if (method === "disconnect" && value === undefined) return realtime?.disconnect();
        throw new Error("Invalid realtime operation.");
      });
      app.on("before-quit", () => realtime?.disconnect());
      const fetchAPI = desktopAPITransport({
        getCookie: () => authClient.getCookie(),
        authFetch: (path, options) => authClient.$fetch(path, options),
        installationId: installation,
      });
      harness = createHarnessController({
        backend,
        accountsDirectory: join(app.getPath("userData"), "accounts"),
        // Main records what each server tool call published for the turn that made it.
        fetchAPI: observeMcpCalls(fetchAPI, (request, result) =>
          agentWork?.observeToolCall(request, result),
        ),
        createWorker: (directory, proxy, localTools) =>
          createHarnessProcess(
            fileURLToPath(
              new URL(
                app.isPackaged ? "./harness-worker.js" : "../.runtime/harness-worker.js",
                import.meta.url,
              ),
            ),
            directory,
            // Harness events go to agent work, which writes them locally before anything else.
            (event) => agentWork?.onHarnessEvent(event),
            proxy,
            localTools,
          ),
      });
      const controller = harness;
      agentWork = createAgentWorkService({
        backend,
        installationId: installation,
        device: { name: hostname(), platform: process.platform },
        fetchAPI,
        harness: {
          synchronize: () => controller.run("synchronize").then(() => {}),
          execute: (command) => controller.execute(command),
          closeOrganization: (organizationId) => controller.closeOrganization(organizationId),
          readProfile: (agentId) => controller.readProfile(agentId),
        },
        accountsDirectory: join(app.getPath("userData"), "accounts"),
        migrationsDirectory: app.isPackaged
          ? fileURLToPath(new URL("./client-storage-migrations/", import.meta.url))
          : undefined,
        notify: (change) => emitToRenderer(mainWindow, agentWorkChangeChannel, change, rendererURL),
        log: (message) => console.warn(message),
      });
      const service = agentWork;
      // Local tools (save_handoff, helpers) run in agent work, not on the server.
      controller.setLocalToolHandler((request) => service.handleLocalTool(request));
      if (!smokeTest) agentWork.start();
      ipcMain.handle(agentWorkChannel, (event, method, value) => {
        if (!trustedSender(event, mainWindow?.webContents, rendererURL))
          throw new Error("Agent work unavailable.");
        if (!agentWork) throw new Error("Agent work unavailable.");
        return agentWork.call(method, value);
      });
      ipcMain.handle(desktopSettingsChannel, (event, method, value) => {
        if (!trustedSender(event, mainWindow?.webContents, rendererURL))
          throw new Error("Settings unavailable.");
        const enabled = z.boolean().safeParse(value);
        if (method === "setLaunchAtLogin" && enabled.success)
          app.setLoginItemSettings({ openAtLogin: enabled.data, args: loginArguments });
        else if (method !== "get" || value !== undefined)
          throw new Error("Invalid settings operation.");
        return { launchAtLogin: app.getLoginItemSettings({ args: loginArguments }).openAtLogin };
      });
      ipcMain.handle(harnessChannel, (event, method, value) => {
        if (!trustedSender(event, mainWindow?.webContents, rendererURL))
          throw new Error("Harness unavailable.");
        if (method === "disconnect" && value === undefined) {
          harness?.disconnect();
          return;
        }
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
        else mainWindow?.show();
      });
      if (!smokeTest) void createTray().catch(console.error);
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
}
