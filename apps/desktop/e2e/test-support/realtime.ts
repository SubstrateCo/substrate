import type { RealtimeAPI, RealtimeUpdate } from "@startup-os/contracts/realtime";

import { expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

declare global {
  interface Window {
    startupOSRealtime?: RealtimeAPI;
  }
}

export async function observeRealtime(page: Page) {
  return page.evaluateHandle(() => {
    const bridge = window.startupOSRealtime;
    if (!bridge) throw new Error("The Electron realtime preload bridge is unavailable.");
    const events: RealtimeUpdate[] = [];
    const stop = bridge.onEvent((event: RealtimeUpdate) => events.push(event));
    return { events, stop };
  });
}

export async function disconnectRealtime(page: Page) {
  await page.evaluate(() => {
    if (!window.startupOSRealtime)
      throw new Error("The Electron realtime preload bridge is unavailable.");
    return window.startupOSRealtime.disconnect();
  });
}

export async function reconnectRealtime(page: Page) {
  const observation = await observeRealtime(page);
  try {
    await disconnectRealtime(page);
    await page.evaluate(async () => {
      const response = await fetch("/api/v1/session");
      const session = await response.json();
      if (!window.startupOSRealtime)
        throw new Error("The Electron realtime preload bridge is unavailable.");
      await window.startupOSRealtime.connect({
        organizationId: session.data.session.activeOrganizationId,
      });
    });
    await expect
      .poll(() =>
        observation.evaluate(({ events }) => events.some((event) => event.type === "ready")),
      )
      .toBe(true);
  } finally {
    await observation.evaluate(({ stop }) => stop());
    await observation.dispose();
  }
}

export async function waitForRealtimeIdle(page: Page) {
  const activity = await page.evaluateHandle(() => {
    const bridge = window.startupOSRealtime;
    if (!bridge) throw new Error("The Electron realtime preload bridge is unavailable.");
    const original = window.fetch;
    let pending = 0;
    let lastActivity = performance.now();
    const stop = bridge.onEvent(() => {
      lastActivity = performance.now();
    });
    window.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
      pending++;
      lastActivity = performance.now();
      try {
        return await original(...args);
      } finally {
        pending--;
        lastActivity = performance.now();
      }
    }, original);
    return {
      idle: () => pending === 0 && performance.now() - lastActivity >= 250,
      restore: () => {
        window.fetch = original;
        stop();
      },
    };
  });
  try {
    // A quiet socket can still have committed changes waiting in the server outbox.
    await execFileAsync(
      "bun",
      [fileURLToPath(new URL("../../../../scripts/testing/realtime-outbox.ts", import.meta.url))],
      { timeout: 20_000 },
    );
    await expect(page.getByRole("status").filter({ hasText: /live updates/ })).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await expect.poll(() => activity.evaluate(({ idle }) => idle())).toBe(true);
  } finally {
    await activity.evaluate(({ restore }) => restore());
    await activity.dispose();
  }
}
