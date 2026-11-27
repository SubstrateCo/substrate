import type { DesktopUpdateStatus } from "@substrate/contracts/desktop/updates-ipc";
import { advanceTimersAsync } from "@substrate/contracts/testing/timers";

import {
  createDesktopUpdater,
  updateCheckIntervalMs,
  updateInstallMode,
  type UpdateInstall,
} from "./updater.ts";
import { afterEach, describe, expect, test, vi } from "bun:test";
import { EventEmitter } from "node:events";

class FakeEngine extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  checks = 0;
  installs: [boolean | undefined, boolean | undefined][] = [];
  nextCheck: () => Promise<{ downloadPromise?: Promise<string[]> | null } | null> = async () =>
    null;
  checkForUpdates() {
    this.checks++;
    return this.nextCheck();
  }
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean) {
    this.installs.push([isSilent, isForceRunAfter]);
  }
}

function setup(install: UpdateInstall, prepareInstall?: () => Promise<void>) {
  const engine = new FakeEngine();
  const changes: DesktopUpdateStatus[] = [];
  const opened: string[] = [];
  const attention: string[] = [];
  const steps: string[] = [];
  const updater = createDesktopUpdater({
    engine,
    install,
    appVersion: "0.1.0",
    releasePage: (version) => `https://github.com/acme/releases/releases/tag/v${version}`,
    onChange: (status) => changes.push(status),
    onAttention: (state) => attention.push(`${state.status}:${state.version}`),
    openExternal: async (url) => {
      opened.push(url);
    },
    prepareInstall: async () => {
      steps.push("shutdown");
      await prepareInstall?.();
    },
    log: () => {},
  });
  engine.quitAndInstall = (isSilent, isForceRunAfter) => {
    steps.push("install");
    engine.installs.push([isSilent, isForceRunAfter]);
  };
  return { engine, updater, changes, opened, attention, steps };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("updateInstallMode", () => {
  test("installs on packaged Windows, links out on packaged macOS, and never runs unpackaged", () => {
    expect(updateInstallMode("win32", true)).toBe("automatic");
    expect(updateInstallMode("darwin", true)).toBe("manual");
    expect(updateInstallMode("linux", true)).toBe("unavailable");
    expect(updateInstallMode("win32", false)).toBe("unavailable");
  });
});

describe("Windows updates", () => {
  test("announces restart while shutdown is pending and ignores late update events", async () => {
    const shutdown = Promise.withResolvers<void>();
    const { engine, updater, changes } = setup("automatic", () => shutdown.promise);
    engine.emit("update-downloaded", { version: "0.2.0" });
    const installing = updater.installNow();
    try {
      expect(changes.at(-1)?.state).toEqual({ status: "installing", version: "0.2.0" });
      expect(engine.installs).toEqual([]);
      engine.emit("update-not-available");
      engine.emit("update-downloaded", { version: "0.2.0" });
      await updater.checkForUpdates();
      await updater.installNow();
      expect(updater.status().state).toEqual({ status: "installing", version: "0.2.0" });
      expect(engine.checks).toBe(0);
    } finally {
      shutdown.resolve();
      await installing;
    }
    expect(engine.installs).toEqual([[true, true]]);
  });

  test("an installer exception clears restart progress and reports the failure", async () => {
    const { engine, updater } = setup("automatic");
    engine.emit("update-downloaded", { version: "0.2.0" });
    engine.quitAndInstall = () => {
      throw new Error("installer unavailable");
    };
    await updater.installNow();
    expect(updater.status().state).toEqual({ status: "error" });
  });

  test("a late failed check cannot dismiss restart progress during shutdown", async () => {
    const shutdown = Promise.withResolvers<void>();
    const check = Promise.withResolvers<null>();
    const { engine, updater } = setup("automatic", () => shutdown.promise);
    engine.nextCheck = () => check.promise;
    const checking = updater.checkForUpdates();
    engine.emit("update-downloaded", { version: "0.2.0" });
    const installing = updater.installNow();
    try {
      check.reject(new Error("check disconnected"));
      await checking;
      expect(updater.status().state).toEqual({ status: "installing", version: "0.2.0" });
    } finally {
      shutdown.resolve();
      await installing;
    }
  });

  test("download progress leads to a ready update that installs after shutdown", async () => {
    const { engine, updater, steps, attention } = setup("automatic");
    expect(engine.autoDownload).toBe(true);
    expect(engine.autoInstallOnAppQuit).toBe(true);
    engine.emit("update-available", { version: "0.2.0" });
    engine.emit("download-progress", { percent: 42.5 });
    expect(updater.status().state).toEqual({
      status: "downloading",
      version: "0.2.0",
      percent: 42.5,
    });
    engine.emit("update-downloaded", { version: "0.2.0" });
    expect(updater.status().state).toEqual({ status: "ready", version: "0.2.0" });
    expect(attention).toEqual(["ready:0.2.0"]);

    await updater.installNow();
    await updater.installNow();
    // Agent work stops before the installer replaces the app, and the installer starts once.
    expect(steps).toEqual(["shutdown", "install"]);
    expect(engine.installs).toEqual([[true, true]]);
  });

  test("a failed download shows an error", () => {
    const { engine, updater } = setup("automatic");
    engine.emit("update-available", { version: "0.2.0" });
    engine.emit("error", new Error("network"));
    expect(updater.status().state).toEqual({ status: "error" });
  });

  test("does not check again or install before a download is ready", async () => {
    const { engine, updater } = setup("automatic");
    engine.emit("update-available", { version: "0.2.0" });
    await updater.checkForUpdates();
    await updater.installNow();
    expect(engine.checks).toBe(0);
    expect(engine.installs).toEqual([]);
  });
});

describe("macOS updates", () => {
  test("only reports the new version and opens its release page", async () => {
    const { engine, updater, opened } = setup("manual");
    expect(engine.autoDownload).toBe(false);
    expect(engine.autoInstallOnAppQuit).toBe(false);
    engine.emit("update-available", { version: "0.3.0" });
    expect(updater.status().state).toEqual({ status: "available", version: "0.3.0" });
    await updater.openDownloadPage();
    await updater.installNow();
    expect(opened).toEqual(["https://github.com/acme/releases/releases/tag/v0.3.0"]);
    expect(engine.installs).toEqual([]);
  });

  test("asks for attention once per version", () => {
    const { engine, attention } = setup("manual");
    engine.emit("update-available", { version: "0.3.0" });
    engine.emit("update-available", { version: "0.3.0" });
    engine.emit("update-available", { version: "0.3.1" });
    expect(attention).toEqual(["available:0.3.0", "available:0.3.1"]);
  });
});

describe("checks", () => {
  test("a manual check shows progress, then the result", async () => {
    const { engine, updater, changes } = setup("manual");
    engine.nextCheck = async () => {
      engine.emit("update-not-available");
      return null;
    };
    const status = await updater.checkForUpdates();
    expect(changes.map((change) => change.state.status)).toEqual(["checking", "current"]);
    expect(status).toEqual({
      appVersion: "0.1.0",
      install: "manual",
      state: { status: "current" },
    });
  });

  test("a failed manual check shows an error, but a failed background check stays quiet", async () => {
    const { engine, updater } = setup("manual");
    engine.nextCheck = async () => {
      engine.emit("error", new Error("offline"));
      throw new Error("offline");
    };
    await updater.checkForUpdates();
    expect(updater.status().state).toEqual({ status: "error" });

    engine.emit("update-available", { version: "0.3.0" });
    vi.useFakeTimers();
    updater.start();
    await advanceTimersAsync();
    expect(engine.checks).toBe(2);
    expect(updater.status().state).toEqual({ status: "available", version: "0.3.0" });
    updater.stop();
  });

  test("checks at start and then every four hours", async () => {
    vi.useFakeTimers();
    const { engine, updater } = setup("automatic");
    updater.start();
    await advanceTimersAsync();
    expect(engine.checks).toBe(1);
    vi.advanceTimersByTime(updateCheckIntervalMs);
    await advanceTimersAsync();
    expect(engine.checks).toBe(2);
    updater.stop();
    vi.advanceTimersByTime(updateCheckIntervalMs);
    expect(engine.checks).toBe(2);
  });

  test("an installation that cannot update never checks", async () => {
    const { engine, updater } = setup("unavailable");
    updater.start();
    const status = await updater.checkForUpdates();
    expect(engine.checks).toBe(0);
    expect(status.install).toBe("unavailable");
  });
});
