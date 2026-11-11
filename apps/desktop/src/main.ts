import { agentWorkChannel } from "@substrate/contracts/agent-work/desktop";
import { handleBridge } from "@substrate/contracts/desktop/ipc";
import { desktopScheme, resolveDesktopLink } from "@substrate/contracts/desktop/links";
import * as settingsIPC from "@substrate/contracts/desktop/settings-ipc";
import { desktopSettingsChannel } from "@substrate/contracts/desktop/window";
import * as harnessIPC from "@substrate/contracts/harness/ipc";
import { realtimeChannel } from "@substrate/contracts/realtime";
import * as realtimeIPC from "@substrate/contracts/realtime/ipc";

import { installationId } from "./agents/installation.ts";
import { composeDesktop } from "./app/composition.ts";
import { createDesktopAuthClient } from "./auth/auth-client.js";
import { applicationURL, bundledApplicationURL, navigationTarget } from "./shell/navigation.js";
import { registerWindowBridge } from "./shell/title-bar.ts";
import { trustedSender } from "./shell/trusted-sender.ts";
import { createShellWindow, configurePermissions } from "./shell/window.ts";
import { desktopAPITransport } from "./transport/api-transport.js";
import { backendURL } from "./transport/bundled-renderer.js";
import { configureProtocols } from "./transport/protocols.ts";
import { emitToRenderer } from "./transport/realtime-events.ts";
import { storageOrigins } from "./transport/storage.js";
import { app, BrowserWindow, ipcMain, Menu, session, Tray } from "electron";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function main() {
  const bundled = app.isPackaged || app.commandLine.hasSwitch("bundled-renderer");
  const rendererURL = bundled ? bundledApplicationURL : applicationURL;
  /** @param {string} url */
  const target = (url: string) => navigationTarget(url, rendererURL);

  const errorPageURL = new URL(
    app.isPackaged ? "./offline.html" : "./shell/offline.html",
    import.meta.url,
  ).href;
  const errorPage = fileURLToPath(errorPageURL);
  app.setName("Substrate");
  // Keep the lock identity stable for package, source-file, and smoke-test launches.
  const smokeTest = app.commandLine.hasSwitch("desktop-smoke-test");
  const testID = smokeTest ? process.env.SUBSTRATE_TEST_ID : undefined;
  if (testID && !/^[a-zA-Z0-9-]+$/.test(testID)) throw new Error("Invalid desktop test ID.");
  app.setPath(
    "userData",
    join(app.getPath("appData"), "Substrate", ...(testID ? ["tests", testID] : [])),
  );
  const sessionPartition = smokeTest ? "substrate-smoke-test" : "persist:substrate";
  const publicConfig = app.isPackaged
    ? JSON.parse(readFileSync(new URL("./desktop-config.json", import.meta.url), "utf8"))
    : {};
  const backend = backendURL(process.env.SUBSTRATE_API_URL ?? publicConfig.apiURL, app.isPackaged);
  // Signed uploads go to the server's storage endpoint. A packaged app uses the origin from its
  // build, so an unrelated S3_ENDPOINT on the machine cannot widen it.
  const storageEndpoint = app.isPackaged ? undefined : process.env.S3_ENDPOINT;
  const allowedStorageOrigins = storageOrigins(
    storageEndpoint ? new URL(storageEndpoint).origin : publicConfig.storageOrigins,
    app.isPackaged,
  );
  let realtime: ReturnType<typeof composeDesktop>["realtime"] | undefined;
  let agentWork: ReturnType<typeof composeDesktop>["agentWork"] | undefined;
  let services: ReturnType<typeof composeDesktop> | undefined;
  let tray: Tray | undefined;
  // Closing the window hides it so agents keep running. Quit from the tray or the app menu.
  let quitting = false;
  // A login launch starts in the tray.
  const loginArguments = ["--hidden"];
  const startHidden = process.argv.includes("--hidden");
  async function stopSession() {
    await services?.shutdown();
  }
  const { authClient, handleAuthLink } = createDesktopAuthClient(
    backend,
    process.env.SUBSTRATE_WEB_URL ?? publicConfig.webURL ?? applicationURL,
    smokeTest,
    () => mainWindow,
    stopSession,
    async () => {
      await stopSession();
      if (!smokeTest) agentWork?.start();
      const contents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : undefined;
      if (contents && !contents.isDestroyed() && target(contents.getURL()) === "internal")
        contents.reload();
    },
  );
  /** @type {BrowserWindow | undefined} */
  let mainWindow: BrowserWindow | undefined;
  /** @type {string[]} */
  const pendingDestinations: string[] = [];

  /** @param {string[]} values */
  function acceptLinks(values: string[]) {
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

  function createWindow() {
    const window = createShellWindow({
      rendererURL,
      partition: sessionPartition,
      preload: fileURLToPath(
        new URL(app.isPackaged ? "./preload.cjs" : "../.runtime/preload.cjs", import.meta.url),
      ),
      startHidden: startHidden && !smokeTest,
      errorPageURL,
      errorPage,
      shouldHide: () => !quitting && !smokeTest,
      onClosed: () => {
        void stopSession().catch(console.error);
        mainWindow = undefined;
      },
      onNavigation: () => realtime?.disconnect(),
    });
    mainWindow = window;
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
    tray.setToolTip("Substrate");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Substrate", click: showWindow },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
    tray.on("click", showWindow);
  }

  if (!app.requestSingleInstanceLock()) {
    console.log("Substrate is already running. Focusing the existing window.");
    app.quit();
  } else {
    // One dispatcher owns workspace links and auth callbacks. Better Auth owns PKCE and exchange.
    authClient.setupMain({ getWindow: () => mainWindow, scheme: false, bridges: true, csp: false });
    if (!smokeTest) {
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
    let shutdownComplete = false;
    app.on("before-quit", (event) => {
      quitting = true;
      if (shutdownComplete || !services) return;
      event.preventDefault();
      void services
        .shutdown()
        .catch(console.error)
        .finally(() => {
          shutdownComplete = true;
          app.quit();
        });
    });
    void app
      .whenReady()
      .then(() => {
        registerWindowBridge(rendererURL);
        const desktopSession = session.fromPartition(sessionPartition);
        const installation = installationId(app.getPath("userData"));
        const accountsDirectory = join(app.getPath("userData"), "accounts");
        const fetchAPI = desktopAPITransport({
          getCookie: () => authClient.getCookie(),
          authFetch: (path, options) => authClient.$fetch(path, options),
          installationId: installation,
        });
        services = composeDesktop({
          backend,
          accountsDirectory,
          fetchAPI,
          getCookie: () => authClient.getCookie(),
          workerEntry: fileURLToPath(
            new URL(
              app.isPackaged ? "./harness-worker.js" : "../.runtime/harness-worker.js",
              import.meta.url,
            ),
          ),
          installationId: installation,
          device: { name: hostname(), platform: process.platform },
          migrationsDirectory: app.isPackaged
            ? fileURLToPath(new URL("./client-storage-migrations/", import.meta.url))
            : undefined,
          emit: (channel, value) => emitToRenderer(mainWindow, channel, value, rendererURL),
        });
        const composed = services;
        ({ agentWork, realtime } = composed);
        const dispatchRealtime = handleBridge(realtimeChannel, realtimeIPC.methods, {
          connect: (input) => composed.realtime.connect(input),
          disconnect: () => composed.realtime.disconnect(),
        });
        ipcMain.handle(realtimeChannel, (event, method, value) => {
          if (!trustedSender(event, mainWindow?.webContents, rendererURL))
            throw new Error("Realtime unavailable.");
          return dispatchRealtime(method, value);
        });
        if (!smokeTest) agentWork.start();
        ipcMain.handle(agentWorkChannel, (event, method, value) => {
          if (!trustedSender(event, mainWindow?.webContents, rendererURL))
            throw new Error("Agent work unavailable.");
          if (!agentWork) throw new Error("Agent work unavailable.");
          return agentWork.call(method, value);
        });
        const readSettings = () => ({
          launchAtLogin: app.getLoginItemSettings({ args: loginArguments }).openAtLogin,
        });
        const dispatchSettings = handleBridge(desktopSettingsChannel, settingsIPC.methods, {
          get: readSettings,
          setLaunchAtLogin: (enabled) => {
            app.setLoginItemSettings({ openAtLogin: enabled, args: loginArguments });
            return readSettings();
          },
        });
        ipcMain.handle(desktopSettingsChannel, (event, method, value) => {
          if (!trustedSender(event, mainWindow?.webContents, rendererURL))
            throw new Error("Settings unavailable.");
          return dispatchSettings(method, value);
        });
        const dispatchHarness = handleBridge(harnessIPC.channel, harnessIPC.methods, {
          status: () => composed.harness.run("status"),
          synchronize: () => composed.harness.run("synchronize"),
          disconnect: () => composed.shutdown(),
          listModels: (input) => composed.harness.run("listModels", input),
          scanConfiguration: (input) => composed.harness.run("scanConfiguration", input),
          saveSkill: (input) => composed.harness.run("saveSkill", input),
          deleteSkill: (input) => composed.harness.run("deleteSkill", input),
          resetDefaults: (input) => composed.harness.run("resetDefaults", input),
          saveMcpServer: (input) => composed.harness.run("saveMcpServer", input),
          deleteMcpServer: (input) => composed.harness.run("deleteMcpServer", input),
        });
        ipcMain.handle(harnessIPC.channel, (event, method, value) => {
          if (!trustedSender(event, mainWindow?.webContents, rendererURL))
            throw new Error("Harness unavailable.");
          return dispatchHarness(method, value);
        });
        configureProtocols({
          desktopSession,
          bundled,
          rendererURL,
          backend,
          allowedStorageOrigins,
          fetchAPI,
          directory: bundled
            ? fileURLToPath(
                new URL(app.isPackaged ? "./renderer/" : "../../web/dist/", import.meta.url),
              )
            : ".",
        });
        configurePermissions(desktopSession, () => mainWindow, rendererURL);
        Menu.setApplicationMenu(
          Menu.buildFromTemplate([
            ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
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
}

main();
