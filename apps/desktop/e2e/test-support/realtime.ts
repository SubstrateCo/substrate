import type { RealtimeAPI, RealtimeUpdate } from "@startup-os/contracts/realtime";

import { expect, type Page } from "@playwright/test";

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
