import { callMessaging } from "../../../web/e2e/test-support/api.js";
import {
  provisionWorkspaceSession,
  switchWorkspace,
} from "../../../web/e2e/test-support/organizations.js";
import { test } from "../test-support/fixture.js";
import {
  disconnectRealtime,
  observeRealtime,
  reconnectRealtime,
  waitForRealtimeIdle,
} from "../test-support/realtime.js";
import { expect, type Page } from "@playwright/test";

async function openChannel(page: Page, name: string) {
  await page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function send(page: Page, composer: string, body: string) {
  const input = page.getByRole("textbox", { name: composer, exact: true });
  await input.fill(body);
  await input.press("Enter");
}

for (const privateChannel of [true, false]) {
  test(`cross-organization ${privateChannel ? "private" : "public"} partner channels deliver roots, replies and reactions both ways in viewer workspaces`, async ({
    desktop,
    desktopPeer,
  }) => {
    test.setTimeout(180_000);
    await Promise.all([desktop.provision(), desktopPeer.provision()]);
    const owner = desktop.page;
    const partner = desktopPeer.page;
    expect(desktop.launchOptions.env!.STARTUP_OS_TEST_ID).not.toBe(
      desktopPeer.launchOptions.env!.STARTUP_OS_TEST_ID,
    );
    expect(desktop.browser.context()).not.toBe(desktopPeer.browser.context());
    await Promise.all([reconnectRealtime(owner), reconnectRealtime(partner)]);
    const created = await callMessaging<{ id: string }>(owner, "createConversation", {
      kind: "channel",
      name: "live-partner-channel",
      private: privateChannel,
      emails: [desktopPeer.owner.email],
    });
    expect(created.error).toBeNull();
    const conversationId = created.data!.id;
    // Both lists were already loaded. No reload or local invalidation may reveal this channel.
    await Promise.all([
      openChannel(owner, "live-partner-channel"),
      openChannel(partner, "live-partner-channel"),
    ]);
    const changes = await observeRealtime(partner);
    try {
      await send(owner, "Message #live-partner-channel", "Organization A root");
      const partnerRoot = partner.getByRole("article").filter({ hasText: "Organization A root" });
      await expect(partnerRoot).toBeVisible();
      const viewerOrganizationId = await partner.evaluate(
        async () =>
          (await (await fetch("/api/v1/session")).json()).data.session.activeOrganizationId,
      );
      await expect
        .poll(() =>
          changes.evaluate(
            ({ events }, input) =>
              events.some(
                (event) =>
                  event.type === "change" &&
                  event.domain === "messaging" &&
                  event.conversationId === input.conversationId &&
                  event.organizationId === input.viewerOrganizationId,
              ),
            { conversationId, viewerOrganizationId },
          ),
        )
        .toBe(true);
      await send(partner, "Message #live-partner-channel", "Organization B root");
      await expect(
        owner.getByRole("article").filter({ hasText: "Organization B root" }),
      ).toBeVisible();
      for (const page of [owner, partner]) {
        const root = page.getByRole("article").filter({ hasText: "Organization A root" });
        await root.hover();
        await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
      }
      const ownerThread = owner.getByRole("complementary", { name: "Thread", exact: true });
      const partnerThread = partner.getByRole("complementary", { name: "Thread", exact: true });
      await send(owner, "Reply in thread…", "Organization A reply");
      await expect(
        partnerThread.getByRole("article").filter({ hasText: "Organization A reply" }),
      ).toBeVisible();
      await send(partner, "Reply in thread…", "Organization B reply");
      await expect(
        ownerThread.getByRole("article").filter({ hasText: "Organization B reply" }),
      ).toBeVisible();
      const messages = await callMessaging<{ id: string; body: string }[]>(owner, "listMessages", {
        conversationId,
      });
      expect(messages.error).toBeNull();
      const messageId = messages.data!.find(
        (message) => message.body === "Organization A root",
      )!.id;
      for (const [writer, viewer] of [
        [partner, owner],
        [owner, partner],
      ] as const) {
        const reacted = await callMessaging(writer, "toggleReaction", { messageId, emoji: "👍" });
        expect(reacted.error).toBeNull();
        await expect(
          viewer
            .getByRole("region", { name: "live-partner-channel", exact: true })
            .getByRole("article")
            .filter({ hasText: "Organization A root" })
            .getByRole("button", {
              name: `👍, ${writer === partner ? 1 : 2} reactions`,
              exact: true,
            }),
        ).toBeVisible();
      }
      await disconnectRealtime(partner);
      await send(owner, "Reply in thread…", "Missed while disconnected");
      await expect(
        ownerThread.getByRole("article").filter({ hasText: "Missed while disconnected" }),
      ).toBeVisible();
      await expect(
        partnerThread.getByRole("article").filter({ hasText: "Missed while disconnected" }),
      ).toHaveCount(0);
      await reconnectRealtime(partner);
      await expect(
        partnerThread.getByRole("article").filter({ hasText: "Missed while disconnected" }),
      ).toBeVisible();
      await waitForRealtimeIdle(partner);
      // Advance past both former polling periods without a real-time sleep.
      await partner.clock.install();
      const idle = await partner.evaluateHandle(() => {
        const original = window.fetch;
        const requests: string[] = [];
        window.fetch = Object.assign((...args: Parameters<typeof fetch>) => {
          const input = args[0];
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          if (url.pathname.startsWith("/api/v1/messaging/")) requests.push(url.pathname);
          return original(...args);
        }, original);
        return {
          requests,
          restore: () => {
            window.fetch = original;
          },
        };
      });
      try {
        await partner.clock.fastForward(6_500);
        expect(await idle.evaluate(({ requests }) => requests)).toEqual([]);
      } finally {
        await idle.evaluate(({ restore }) => restore());
        await idle.dispose();
      }
    } finally {
      await changes.evaluate(({ stop }) => stop());
      await changes.dispose();
    }
  });
}

test("unrelated workspaces receive neither private nor public channel changes and switching isolates caches", async ({
  desktop,
  desktopPeer,
}) => {
  test.setTimeout(180_000);
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  const owner = desktop.page;
  const outsider = desktopPeer.page;
  await Promise.all([reconnectRealtime(owner), reconnectRealtime(outsider)]);
  const observation = await observeRealtime(outsider);
  try {
    const ids: string[] = [];
    for (const privateChannel of [true, false]) {
      const created = await callMessaging<{ id: string }>(owner, "createConversation", {
        kind: "channel",
        name: privateChannel ? "private-no-leak" : "public-no-leak",
        private: privateChannel,
      });
      expect(created.error).toBeNull();
      ids.push(created.data!.id);
      const sent = await callMessaging(owner, "sendMessage", {
        conversationId: created.data!.id,
        body: "Confidential workspace content",
      });
      expect(sent.error).toBeNull();
      const denied = await callMessaging(outsider, "listMessages", {
        conversationId: created.data!.id,
      });
      expect(denied.errorCode).toBe("NOT_FOUND");
    }
    // A successful viewer-local event is a delivery barrier, not a sleep-based privacy assertion.
    const own = await callMessaging(outsider, "createConversation", {
      kind: "channel",
      name: "outsider-local",
    });
    expect(own.error).toBeNull();
    await openChannel(outsider, "outsider-local");
    expect(
      await observation.evaluate(
        ({ events }, ids) =>
          events.filter(
            (event) =>
              event.type === "change" && event.conversationId && ids.includes(event.conversationId),
          ),
        ids,
      ),
    ).toEqual([]);
    const listed = await callMessaging<{ id: string }[]>(outsider, "listConversations");
    expect(listed.error).toBeNull();
    expect(listed.data!.filter(({ id }) => ids.includes(id))).toEqual([]);
    await expect(outsider.getByText("private-no-leak", { exact: true })).toHaveCount(0);
    await expect(outsider.getByText("public-no-leak", { exact: true })).toHaveCount(0);
  } finally {
    await observation.evaluate(({ stop }) => stop());
    await observation.dispose();
  }
  const otherName = `Other ${desktopPeer.suffix.slice(0, 8)}`;
  await provisionWorkspaceSession(
    desktopPeer.browser.request,
    otherName,
    `other-${desktopPeer.suffix}`,
  );
  // The renderer session remains native; switch through its real workspace menu.
  await outsider.reload();
  await switchWorkspace(outsider, desktopPeer.workspace, otherName);
  await reconnectRealtime(outsider);
  await expect(outsider.getByRole("button", { name: "outsider-local", exact: true })).toHaveCount(
    0,
  );
  await switchWorkspace(outsider, otherName, desktopPeer.workspace);
  await openChannel(outsider, "outsider-local");
});
