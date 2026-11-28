import { agentWorkChannel } from "@substrate/contracts/agent-work/desktop";
import * as attentionIPC from "@substrate/contracts/desktop/attention-ipc";
import { desktopIdentity } from "@substrate/contracts/desktop/identity";
import { handleBridge } from "@substrate/contracts/desktop/ipc";
import { resolveDesktopLink } from "@substrate/contracts/desktop/links";
import { defaultMeetingReminderSettings } from "@substrate/contracts/desktop/screen-notifications-ipc";
import * as settingsIPC from "@substrate/contracts/desktop/settings-ipc";
import { desktopSettingsChannel } from "@substrate/contracts/desktop/window";
import * as harnessIPC from "@substrate/contracts/harness/ipc";
import * as mailIPC from "@substrate/contracts/mail/ipc";
import { realtimeChannel } from "@substrate/contracts/realtime";
import * as realtimeIPC from "@substrate/contracts/realtime/ipc";

import { installationId } from "./agents/installation.ts";
import { pickWorkspace } from "./agents/workspace-picker.ts";
import { composeDesktop } from "./app/composition.ts";
import { createDesktopAuthClient, sessionTokenCookie } from "./auth/auth-client.ts";
import { HarnessCommandError } from "./harness/controller/harness-controller.ts";
import { createAttentionSession } from "./notifications/attention-session.ts";
import { createNativeAttentionBadge } from "./notifications/native-attention-badge.ts";
import {
  setupScreenNotifications,
  type ScreenNotifications,
} from "./notifications/screen-notifications.ts";
import { createUserSettingsStore } from "./settings/user-settings-store.ts";
import { applicationURL, bundledApplicationURL, navigationTarget } from "./shell/navigation.ts";
import { registerWindowBridge } from "./shell/title-bar.ts";
import { trustedSender } from "./shell/trusted-sender.ts";
import { createShellWindow, configurePermissions } from "./shell/window.ts";
import { desktopAPITransport } from "./transport/api-transport.ts";
import { noticeURL } from "./transport/message-notifications.ts";
import { configureProtocols } from "./transport/protocols.ts";
import { publicConfigSchema, resolvePublicConfig } from "./transport/public-config.ts";
import { emitToRenderer } from "./transport/realtime-events.ts";
import { setupDesktopUpdates } from "./updates/desktop-updates.ts";
import {
  app,
  type BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  session,
  shell,
  Tray,
} from "electron";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function main() {
  const identity = desktopIdentity(app.isPackaged);
  const desktopScheme = identity.scheme;
  const bundled = app.isPackaged || app.commandLine.hasSwitch("bundled-renderer");
  const rendererURL = bundled ? bundledApplicationURL : applicationURL;
  /** @param {string} url */
  const target = (url: string) => navigationTarget(url, rendererURL);

  const errorPageURL = new URL(
    app.isPackaged ? "./offline.html" : "./shell/offline.html",
    import.meta.url,
  ).href;
  const errorPage = fileURLToPath(errorPageURL);
  const icon = fileURLToPath(
    new URL(
      `${app.isPackaged ? "./" : "../"}assets/${process.platform === "darwin" ? "icon-mac.png" : `icon.${process.platform === "win32" ? "ico" : "png"}`}`,
      import.meta.url,
    ),
  );
  app.setName(identity.name);
  if (process.platform === "win32") app.setAppUserModelId(identity.appId);
  // Keep each environment's lock and local state under its own data root.
  const smokeTest = app.commandLine.hasSwitch("desktop-smoke-test");
  const testID = smokeTest ? process.env.SUBSTRATE_TEST_ID : undefined;
  if (testID && !/^[a-zA-Z0-9-]+$/.test(testID)) throw new Error("Invalid desktop test ID.");
  app.setPath(
    "userData",
    join(app.getPath("appData"), identity.directory, ...(testID ? ["tests", testID] : [])),
  );
  app.setPath("sessionData", app.getPath("userData"));
  const sessionPartition = smokeTest ? "substrate-smoke-test" : "persist:substrate";
  const publicConfig = resolvePublicConfig(process.env, {
    packaged: app.isPackaged,
    built: app.isPackaged
      ? publicConfigSchema
          .partial()
          .parse(
            JSON.parse(readFileSync(new URL("./desktop-config.json", import.meta.url), "utf8")),
          )
      : undefined,
  });
  const backend = publicConfig.apiURL;
  const allowedStorageOrigins = publicConfig.storageOrigins;
  let realtime: ReturnType<typeof composeDesktop>["realtime"] | undefined;
  let agentWork: ReturnType<typeof composeDesktop>["agentWork"] | undefined;
  let services: ReturnType<typeof composeDesktop> | undefined;
  let tray: Tray | undefined;
  let attentionSession: ReturnType<typeof createAttentionSession> | undefined;
  // Closing the window hides it so agents keep running. Quit from the tray or the app menu.
  let quitting = false;
  // A login launch starts in the tray.
  const loginArguments = process.defaultApp
    ? [
        process.platform === "win32"
          ? `"${fileURLToPath(import.meta.url)}"`
          : fileURLToPath(import.meta.url),
        "--hidden",
      ]
    : ["--hidden"];
  const startHidden = process.argv.includes("--hidden");
  async function stopSession() {
    attentionSession?.clear();
    await services?.shutdown();
  }
  const { authClient, handleAuthLink, initializeSession } = createDesktopAuthClient(
    backend,
    publicConfig.webURL ?? applicationURL,
    smokeTest,
    () => mainWindow,
    () => {
      attentionSession?.suspend();
      void stopSession().catch(console.error);
    },
    async () => {
      await stopSession();
      attentionSession?.resume();
      if (!smokeTest) agentWork?.start();
      const contents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : undefined;
      if (contents && !contents.isDestroyed() && target(contents.getURL()) === "internal")
        contents.reload();
    },
    desktopScheme,
  );
  /** @type {BrowserWindow | undefined} */
  let mainWindow: BrowserWindow | undefined;
  /** @type {string[]} */
  const pendingDestinations: string[] = [];

  /** @param {string[]} values */
  function acceptLinks(values: string[]) {
    for (const value of values) {
      const destination = resolveDesktopLink(value, rendererURL, desktopScheme);
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
      name: identity.name,
      icon,
      production: app.isPackaged,
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
  function createTray() {
    const trayIcon =
      process.platform === "darwin"
        ? nativeImage.createFromPath(join(dirname(icon), "trayTemplate.png"))
        : icon;
    tray = new Tray(trayIcon);
    tray.setToolTip(identity.name);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Open ${identity.name}`, click: showWindow },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
    tray.on("click", showWindow);
  }

  if (!app.requestSingleInstanceLock()) {
    console.log(`${identity.name} is already running. Focusing the existing window.`);
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
    // The update installer replaces the app as soon as it quits. Finish the same shutdown first,
    // so before-quit does not hold the old version open while the installer runs.
    async function shutdownForUpdate() {
      quitting = true;
      try {
        await services?.shutdown();
      } finally {
        shutdownComplete = true;
      }
    }
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
        initializeSession();
        const attentionBadge = createNativeAttentionBadge(
          () => mainWindow,
          join(dirname(icon), "attention-badges.png"),
        );
        attentionSession = createAttentionSession({
          apply: attentionBadge.set,
          token: () => sessionTokenCookie(authClient.getCookie()),
          readIdentity: async () => {
            const session = await authClient.getSession();
            const user = session.data?.user;
            return user ? { userId: user.id, verified: user.emailVerified } : null;
          },
        });
        const badgeSession = attentionSession;
        const dispatchAttention = handleBridge(attentionIPC.channel, attentionIPC.methods, {
          set: (input) => badgeSession.set(input),
        });
        ipcMain.handle(attentionIPC.channel, (event, method, value) => {
          if (!trustedSender(event, mainWindow?.webContents, rendererURL))
            throw new Error("Attention unavailable.");
          return dispatchAttention(method, value);
        });
        registerWindowBridge(rendererURL, backend, () => mainWindow);
        const desktopSession = session.fromPartition(sessionPartition);
        const installation = installationId(app.getPath("userData"));
        const accountsDirectory = join(app.getPath("userData"), "accounts");
        const fetchAPI = desktopAPITransport({
          getCookie: () => authClient.getCookie(),
          authFetch: (path, options) => authClient.$fetch(path, options),
          installationId: installation,
        });
        // Smoke tests drive a single window, so they run without the overlay.
        const screenNotifications: ScreenNotifications | undefined = smokeTest
          ? undefined
          : setupScreenNotifications({
              rendererURL,
              partition: sessionPartition,
              preload: fileURLToPath(
                new URL(
                  app.isPackaged ? "./overlay-preload.cjs" : "../.runtime/overlay-preload.cjs",
                  import.meta.url,
                ),
              ),
              production: app.isPackaged,
              userData: app.getPath("userData"),
              onWake: () => void services?.meetingReminders?.refresh(),
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
          mailListWorkerEntry: app.isPackaged
            ? join(process.resourcesPath, "app.asar.unpacked", "mail-list-worker.mjs")
            : undefined,
          emit: (channel, value) => emitToRenderer(mainWindow, channel, value, rendererURL),
          showNotification: ({ title, body, silent, flash }, onClick) => {
            if (!Notification.isSupported() || mainWindow?.isFocused()) return () => {};
            // The text follows the account's preview setting. Hidden, the default, keeps private
            // content out of the operating system's notification history.
            const notification = new Notification({ title, body, silent });
            notification.on("click", () => {
              void onClick().catch(() => {});
            });
            notification.show();
            // Flash the taskbar or bounce the dock. "idle" waits until the user is away.
            const away = powerMonitor.getSystemIdleTime() >= 10;
            const frame = mainWindow;
            if (frame && (flash === "always" || (flash === "idle" && away))) {
              frame.flashFrame(true);
              frame.once("focus", () => frame.flashFrame(false));
            }
            return () => notification.close();
          },
          openNotification: (target) => {
            showWindow();
            void mainWindow?.loadURL(noticeURL(target, rendererURL)).catch(() => {});
          },
          screenNotifications,
          openExternal: (url) => void shell.openExternal(url).catch(console.error),
          openCalendarEvent: ({ organizationId, eventId, date }) => {
            const destination = new URL("/calendar", rendererURL);
            destination.searchParams.set("workspaceId", organizationId);
            destination.searchParams.set("eventId", eventId);
            destination.searchParams.set("date", date);
            showWindow();
            void mainWindow?.loadURL(destination.href).catch(() => {});
          },
          pickWorkspace,
        });
        const composed = services;
        ipcMain.handle(mailIPC.channel, (event, method, value) => {
          if (!trustedSender(event, mainWindow?.webContents, rendererURL))
            throw new Error("Mail unavailable.");
          return composed.mail.call(method, value);
        });
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
        const userSettings = createUserSettingsStore(
          join(app.getPath("userData"), "user-settings.json"),
        );
        const readSettings = () => ({
          launchAtLogin: app.getLoginItemSettings({ args: loginArguments }).openAtLogin,
          meetingReminders: screenNotifications?.store.settings() ?? defaultMeetingReminderSettings,
        });
        const dispatchSettings = handleBridge(desktopSettingsChannel, settingsIPC.methods, {
          get: readSettings,
          setLaunchAtLogin: (enabled) => {
            app.setLoginItemSettings({ openAtLogin: enabled, args: loginArguments });
            return readSettings();
          },
          setMeetingReminders: (value) => {
            if (!screenNotifications) throw new Error("Meeting reminders unavailable.");
            screenNotifications.store.setSettings(value);
            void composed.meetingReminders?.refresh();
            return readSettings();
          },
          getShortcuts: () => userSettings.shortcuts(),
          setShortcuts: (value) => userSettings.setShortcuts(value),
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
          chooseWorkspace: (input) => composed.harness.run("chooseWorkspace", input),
          clearWorkspace: (input) => composed.harness.run("clearWorkspace", input),
          signIn: (input) => composed.harness.run("signIn", input),
          readSignIn: (input) => composed.harness.run("readSignIn", input),
          sendSignInInput: (input) => composed.harness.run("sendSignInInput", input),
          cancelSignIn: (input) => composed.harness.run("cancelSignIn", input),
          signOut: (input) => composed.harness.run("signOut", input),
        });
        ipcMain.handle(harnessIPC.channel, (event, method, value) => {
          if (!trustedSender(event, mainWindow?.webContents, rendererURL))
            throw new HarnessCommandError("harness-unavailable", "Harness unavailable.");
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
        if (process.platform === "darwin") app.dock?.setIcon(icon);
        createWindow();
        setupDesktopUpdates({
          enabled: !smokeTest,
          getWindow: () => mainWindow,
          showWindow,
          rendererURL,
          prepareInstall: shutdownForUpdate,
        }).start();
        app.on("activate", () => {
          // The hidden overlay is a window too, so check for the main window itself.
          if (!mainWindow) createWindow();
          else mainWindow.show();
        });
        if (!smokeTest) createTray();
      })
      .catch((error) => {
        console.error(error);
        app.exit(1);
      });
  }
}

main();
