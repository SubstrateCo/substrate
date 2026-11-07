import { callMessaging } from "../../../web/e2e/test-support/api.js";
import type {} from "../../../web/src/lib/desktop/auth.ts";
import { authorizationCallback } from "../test-support/auth.js";
import { test } from "../test-support/realtime-isolated.js";
import { observeRealtime, reconnectRealtime } from "../test-support/realtime.js";
import { expect, type Page } from "@playwright/test";

test.skip(
  Boolean(process.env.DESKTOP_EXECUTABLE_PATH),
  "The isolated server fixture configures source Electron processes, not a packaged backend origin.",
);

async function partnerChannel(owner: Page, partner: Page, email: string) {
  await Promise.all([reconnectRealtime(owner), reconnectRealtime(partner)]);
  const result = await callMessaging<{ id: string }>(owner, "createConversation", {
    kind: "channel",
    name: "lifecycle-partner",
    private: true,
    emails: [email],
  });
  expect(result.error).toBeNull();
  for (const page of [owner, partner]) {
    await page
      .getByRole("complementary", { name: "Conversations", exact: true })
      .getByRole("button", { name: "lifecycle-partner", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "lifecycle-partner", exact: true }),
    ).toBeVisible();
  }
  return result.data!.id;
}

async function send(page: Page, body: string) {
  const composer = page.getByRole("textbox", { name: "Message #lifecycle-partner", exact: true });
  await composer.fill(body);
  await composer.press("Enter");
}

test("a test-owned server restart automatically resyncs missed changes while both desktop drafts survive", async ({
  desktop,
  desktopPeer,
  realtimeServer,
}) => {
  test.setTimeout(180_000);
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  const owner = desktop.page;
  const partner = desktopPeer.page;
  const conversationId = await partnerChannel(owner, partner, desktopPeer.owner.email);
  await send(owner, "Before the owned server restart");
  await expect(
    partner.getByRole("article").filter({ hasText: "Before the owned server restart" }),
  ).toBeVisible();
  const ownerDraft = owner.getByRole("textbox", {
    name: "Message #lifecycle-partner",
    exact: true,
  });
  const partnerDraft = partner.getByRole("textbox", {
    name: "Message #lifecycle-partner",
    exact: true,
  });
  await ownerDraft.fill("Owner draft while offline");
  await partnerDraft.fill("Partner draft while offline");
  const observations = await Promise.all([observeRealtime(owner), observeRealtime(partner)]);
  try {
    await expect.poll(() => realtimeServer.network.nativeConnections).toBe(2);
    realtimeServer.network.blockUpgrades();
    await realtimeServer.stopBackend();
    await expect.poll(() => realtimeServer.network.nativeConnections).toBe(0);
    for (const observation of observations)
      await expect
        .poll(() =>
          observation.evaluate(({ events }) =>
            events.some((event) => event.type === "status" && event.status === "disconnected"),
          ),
        )
        .toBe(true);
    await expect(ownerDraft).toHaveText("Owner draft while offline");
    await expect(partnerDraft).toHaveText("Partner draft while offline");
    await realtimeServer.restartBackend();
    const committed = await callMessaging(owner, "sendMessage", {
      conversationId,
      body: "Committed before socket reconnection",
    });
    expect(committed.error).toBeNull();
    await expect(
      partner.getByRole("article").filter({ hasText: "Committed before socket reconnection" }),
    ).toHaveCount(0);
    await expect.poll(() => realtimeServer.network.deniedUpgrades).toBeGreaterThan(0);
    realtimeServer.network.allowSockets();
    for (const observation of observations)
      await expect
        .poll(() =>
          observation.evaluate(({ events }) => events.some((event) => event.type === "ready")),
        )
        .toBe(true);
    for (const page of [owner, partner])
      await expect(
        page.getByRole("article").filter({ hasText: "Committed before socket reconnection" }),
      ).toHaveCount(1);
    await expect(ownerDraft).toHaveText("Owner draft while offline");
    await expect(partnerDraft).toHaveText("Partner draft while offline");
    const canonical = await callMessaging<{ body: string }[]>(partner, "listMessages", {
      conversationId,
    });
    expect(canonical.error).toBeNull();
    expect(canonical.data!.map((message) => message.body)).toEqual([
      "Before the owned server restart",
      "Committed before socket reconnection",
    ]);
    await expect.poll(() => realtimeServer.network.nativeConnections).toBe(2);
  } finally {
    realtimeServer.network.allowSockets();
    for (const observation of observations) {
      await observation.evaluate(({ stop }) => stop());
      await observation.dispose();
    }
  }
});

test("closing and reauthenticating a desktop during reconnect leaves one live socket per app", async ({
  desktop,
  desktopPeer,
  realtimeServer,
}) => {
  test.setTimeout(180_000);
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  const partner = desktopPeer.page;
  const conversationId = await partnerChannel(desktop.page, partner, desktopPeer.owner.email);
  realtimeServer.network.blockSockets();
  await expect.poll(() => realtimeServer.network.deniedUpgrades).toBeGreaterThan(0);
  await desktop.restart();
  const owner = desktop.page;
  await expect(
    owner.getByRole("button", { name: `${desktop.workspace} ▾`, exact: true }),
  ).toBeVisible();
  const previousSession = await owner.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
  );
  // Invoke the real native authentication bridge while the authenticated page is open.
  await desktop.app.evaluate(({ shell }) => {
    delete process.env.STARTUP_OS_TEST_AUTH_URL;
    shell.openExternal = async (url) => {
      process.env.STARTUP_OS_TEST_AUTH_URL = url;
    };
  });
  await owner.evaluate(() => window.requestAuth!());
  await expect
    .poll(() => desktop.app.evaluate(() => process.env.STARTUP_OS_TEST_AUTH_URL))
    .toBeTruthy();
  const authorizationURL = await desktop.app.evaluate(() => process.env.STARTUP_OS_TEST_AUTH_URL!);
  await desktop.browser.goto(authorizationURL);
  const callback = await authorizationCallback(desktop.browser, () =>
    desktop.browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
  );
  await desktop.openLink(callback);
  await expect(
    owner.getByRole("button", { name: `${desktop.workspace} ▾`, exact: true }),
  ).toBeVisible();
  const current = await owner.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).data,
  );
  expect(current.user.email).toBe(desktop.owner.email);
  expect(current.session.id).not.toBe(previousSession);
  expect(current.session.token).toBeUndefined();
  const committed = await callMessaging(partner, "sendMessage", {
    conversationId,
    body: "Delivered after native lifecycle recovery",
  });
  expect(committed.error).toBeNull();
  const observations = await Promise.all([observeRealtime(owner), observeRealtime(partner)]);
  try {
    realtimeServer.network.allowSockets();
    for (const observation of observations)
      await expect
        .poll(() =>
          observation.evaluate(({ events }) => events.some((event) => event.type === "ready")),
        )
        .toBe(true);
    await expect(
      owner.getByRole("article").filter({ hasText: "Delivered after native lifecycle recovery" }),
    ).toHaveCount(1);
    await expect.poll(() => realtimeServer.network.nativeConnections).toBe(2);
    expect(desktop.app.windows()).toHaveLength(1);
    await expect(
      owner.getByText("Live updates unavailable. Check workspace access.", { exact: true }),
    ).toHaveCount(0);
  } finally {
    realtimeServer.network.allowSockets();
    for (const observation of observations) {
      await observation.evaluate(({ stop }) => stop());
      await observation.dispose();
    }
  }
});
