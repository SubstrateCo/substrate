import type {
  DesktopUpdateState,
  DesktopUpdateStatus,
} from "@substrate/contracts/desktop/updates-ipc";

/** The part of electron-updater's AppUpdater that the desktop uses. */
export interface UpdateEngine {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(
    event: "update-available" | "update-downloaded",
    listener: (info: { version: string }) => void,
  ): void;
  on(event: "update-not-available", listener: () => void): void;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  checkForUpdates(): Promise<{ downloadPromise?: Promise<string[]> | null } | null>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export type UpdateInstall = DesktopUpdateStatus["install"];

export const updateCheckIntervalMs = 10 * 60 * 1000;

/**
 * Windows NSIS builds download and install updates. Unsigned macOS builds cannot install through
 * Squirrel.Mac, so they only check and send the person to the release page.
 */
export function updateInstallMode(platform: NodeJS.Platform, packaged: boolean): UpdateInstall {
  if (!packaged) return "unavailable";
  if (platform === "win32") return "automatic";
  if (platform === "darwin") return "manual";
  return "unavailable";
}

export function createDesktopUpdater(options: {
  /** Absent when this installation cannot update. */
  engine: UpdateEngine | undefined;
  install: UpdateInstall;
  appVersion: string;
  releasePage: (version: string) => string;
  onChange: (status: DesktopUpdateStatus) => void;
  /** Called once per version when an update needs the person: ready to install, or to download. */
  onAttention?: (state: Extract<DesktopUpdateState, { status: "available" | "ready" }>) => void;
  openExternal: (url: string) => Promise<void>;
  /** Stops agent work and services before the installer replaces the running app. */
  prepareInstall: () => Promise<void>;
  log: (message: string, error: Error) => void;
}) {
  const { appVersion, log, onChange } = options;
  const engine = options.install === "unavailable" ? undefined : options.engine;
  const install: UpdateInstall = engine ? options.install : "unavailable";
  let state: DesktopUpdateState = { status: "idle" };
  let pendingCheck: Promise<void> | undefined;
  let installing = false;
  let attentionVersion: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const status = (): DesktopUpdateStatus => ({ appVersion, install, state });
  function set(next: DesktopUpdateState) {
    state = next;
    onChange(status());
    if (
      (next.status === "available" || next.status === "ready") &&
      next.version !== attentionVersion
    ) {
      attentionVersion = next.version;
      options.onAttention?.(next);
    }
  }

  if (engine) {
    engine.autoDownload = install === "automatic";
    engine.autoInstallOnAppQuit = install === "automatic";
    engine.on("update-available", ({ version }) => {
      if (installing || state.status === "ready" || state.status === "downloading") return;
      set(
        install === "automatic"
          ? { status: "downloading", version, percent: 0 }
          : { status: "available", version },
      );
    });
    engine.on("download-progress", ({ percent }) => {
      if (state.status !== "downloading") return;
      set({
        ...state,
        percent: Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0)),
      });
    });
    engine.on("update-downloaded", ({ version }) => {
      if (!installing) set({ status: "ready", version });
    });
    engine.on("update-not-available", () => {
      if (!installing) set({ status: "current" });
    });
    // A failed check also rejects its promise, and check() reports that. This event alone
    // reports download failures, which happen after the check has finished.
    engine.on("error", (error) => {
      if (pendingCheck) return;
      log("Desktop update failed.", error);
      if (state.status !== "downloading" && !installing) return;
      // A failed install lets the person try again.
      installing = false;
      set({ status: "error" });
    });
  }

  async function runCheck(manual: boolean) {
    if (!engine) return;
    const previous = state;
    // Background checks stay quiet. Only a check the person asked for shows progress and errors.
    if (manual) set({ status: "checking" });
    try {
      const result = await engine.checkForUpdates();
      // The error event reports download failures.
      result?.downloadPromise?.catch(() => {});
      if (state.status === "checking") set(previous);
    } catch (error) {
      log(
        "Desktop update check failed.",
        error instanceof Error ? error : new Error(String(error)),
      );
      if (!installing) set(manual ? { status: "error" } : previous);
    }
  }

  async function check(manual: boolean) {
    // A downloaded or downloading update is already the newest this session can install.
    const hasUpdate = state.status === "downloading" || state.status === "ready";
    if (engine && !installing && !hasUpdate) {
      pendingCheck ??= runCheck(manual).finally(() => {
        pendingCheck = undefined;
      });
      await pendingCheck;
    }
    return status();
  }

  return {
    status,
    checkForUpdates: () => check(true),
    /** Check now and then every ten minutes, without blocking startup. */
    start() {
      if (!engine || timer) return;
      void check(false);
      timer = setInterval(() => void check(false), updateCheckIntervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    async installNow() {
      // After a successful call the app quits. A second call would reset electron-updater's
      // guard and start the installer twice, so `installing` stays set unless the install fails.
      if (!engine || install !== "automatic" || installing) return;
      if (state.status !== "ready") return;
      installing = true;
      set({ status: "installing", version: state.version });
      try {
        await options.prepareInstall();
      } catch (error) {
        // Quitting shuts the same services down, so a failure here must not keep the old version.
        log(
          "Desktop shutdown before update failed.",
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      // Silent, then start the new version. The installer keeps the existing install directory.
      // A failure emits the error event before this returns.
      try {
        engine.quitAndInstall(true, true);
      } catch (error) {
        log(
          "Desktop update installation failed.",
          error instanceof Error ? error : new Error(String(error)),
        );
        installing = false;
        set({ status: "error" });
      }
    },
    async openDownloadPage() {
      if (install !== "manual" || state.status !== "available") return;
      await options.openExternal(options.releasePage(state.version));
    },
  };
}
