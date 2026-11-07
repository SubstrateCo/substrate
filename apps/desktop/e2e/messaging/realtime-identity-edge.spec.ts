import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { switchWorkspace } from "../../../web/e2e/test-support/organizations.js";
import { authorizationCallback, requestBrowserSignIn } from "../test-support/auth.js";
import { test } from "../test-support/fixture.js";
import {
  holdIdentityResponse,
  identityProject,
  nativeIdentity,
  notificationIds,
  openIdentityChannel,
} from "../test-support/realtime-identity.js";
import { observeRealtime, reconnectRealtime } from "../test-support/realtime.js";
import { expect } from "@playwright/test";

for (const replacement of ["workspace", "account"] as const) {
  test(`${replacement} replacement discards a held private response and isolates real socket updates`, async ({
    desktop,
    desktopPeer,
  }) => {
    test.setTimeout(180_000);
    await Promise.all([desktop.provision(), desktopPeer.provision()]);
    const page = desktop.page;
    const peer = desktopPeer.page;
    expect(desktop.browser.context()).not.toBe(desktopPeer.browser.context());
    expect(desktop.launchOptions.env!.STARTUP_OS_TEST_ID).not.toBe(
      desktopPeer.launchOptions.env!.STARTUP_OS_TEST_ID,
    );
    const old = (await nativeIdentity(page))!;
    const other = (await nativeIdentity(peer))!;
    const origin = desktop.rendererOrigin;
    for (const [owner, member, organizationId, email] of [
      [desktop.browser, desktopPeer.browser, old.organizationId, desktopPeer.owner.email],
      [desktopPeer.browser, desktop.browser, other.organizationId, desktop.owner.email],
    ] as const) {
      const invited = await owner.request.post("/api/auth/organization/invite-member", {
        headers: { origin },
        data: { organizationId, email, role: "member" },
      });
      expect(invited.ok(), "The verified teammate is invited").toBe(true);
      const invitation: { id: string } = await invited.json();
      const accepted = await member.request.post("/api/auth/organization/accept-invitation", {
        headers: { origin },
        data: { invitationId: invitation.id },
      });
      expect(accepted.ok(), "The verified teammate accepts the invitation").toBe(true);
    }
    await Promise.all([page.reload(), peer.reload()]);
    await switchWorkspace(peer, desktopPeer.workspace, desktop.workspace);
    await Promise.all([reconnectRealtime(page), reconnectRealtime(peer)]);

    await page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: "Tasks", exact: true })
      .click();
    await page.getByRole("button", { name: "New project", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill("Identity owner private project");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Identity owner private project", exact: true }),
    ).toBeVisible();
    const projectId = new URL(page.url()).searchParams.get("projectId")!;
    await page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: "Messages", exact: true })
      .click();
    const privateChannel = await callMessaging<{ id: string }>(page, "createConversation", {
      kind: "channel",
      name: "identity-owner-private",
      private: true,
    });
    expect(privateChannel.error).toBeNull();
    const privateId = privateChannel.data!.id;
    const privateBody = "Identity owner confidential message";
    expect(
      (await callMessaging(page, "sendMessage", { conversationId: privateId, body: privateBody }))
        .error,
    ).toBeNull();
    const shared = await callMessaging<{ id: string }>(page, "createConversation", {
      kind: "channel",
      name: "identity-event-source",
    });
    expect(shared.error).toBeNull();
    const root = await callMessaging<{ id: string }>(page, "sendMessage", {
      conversationId: shared.data!.id,
      body: "Identity owner subscribed root",
    });
    expect(root.error).toBeNull();
    const events = await observeRealtime(page);
    const held = await holdIdentityResponse(page, privateId, privateBody);
    let oldDocumentGone = false;
    try {
      await openIdentityChannel(page, "identity-owner-private");
      await reconnectRealtime(page);
      await expect.poll(() => held.evaluate(({ state }) => state().containsPrivateBody)).toBe(true);
      expect(await held.evaluate(({ state }) => state().successful)).toBe(true);
      expect(await held.evaluate(({ state }) => state().delivered)).toBe(false);
      const reply = await callMessaging(peer, "sendMessage", {
        conversationId: shared.data!.id,
        threadId: root.data!.id,
        body: "Identity pending old workspace reply",
      });
      expect(reply.error).toBeNull();
      await expect
        .poll(() =>
          events.evaluate(
            ({ events }, conversationId) =>
              events.some(
                (event) =>
                  event.type === "change" &&
                  event.domain === "messaging" &&
                  event.conversationId === conversationId,
              ),
            shared.data!.id,
          ),
        )
        .toBe(true);
      const oldNotifications = await notificationIds(page, old.organizationId);
      expect(oldNotifications.length).toBeGreaterThan(0);
      await page
        .getByRole("navigation", { name: "Apps", exact: true })
        .getByRole("button", { name: /^Notifications(?:, unread notifications)?$/ })
        .click();
      await expect(
        page
          .getByRole("region", { name: "Notifications", exact: true })
          .getByText("New thread reply", { exact: true }),
      ).toBeVisible();
      expect(await held.evaluate(({ state }) => state().delivered)).toBe(false);

      if (replacement === "workspace") {
        await switchWorkspace(peer, desktop.workspace, desktopPeer.workspace);
        const navigation = page.waitForEvent(
          "framenavigated",
          (frame) => frame === page.mainFrame(),
        );
        await switchWorkspace(page, desktop.workspace, desktopPeer.workspace);
        await navigation;
        oldDocumentGone = true;
      } else {
        const navigation = page.waitForEvent(
          "framenavigated",
          (frame) => frame === page.mainFrame(),
        );
        await desktop.signout();
        await navigation;
        oldDocumentGone = true;
        const signedOut = await desktop.browser.request.post("/api/auth/sign-out", {
          headers: { origin },
        });
        expect(signedOut.ok()).toBe(true);
        await requestBrowserSignIn(desktop.app, page, desktop.browser);
        await desktop.login(desktopPeer.owner);
        await expect(
          page.getByRole("button", { name: `${desktop.workspace} ▾`, exact: true }),
        ).toBeVisible();
      }
      const current = (await nativeIdentity(page))!;
      expect(current.userId).toBe(replacement === "account" ? other.userId : old.userId);
      expect(current.organizationId).toBe(
        replacement === "workspace" ? other.organizationId : old.organizationId,
      );
      // Both real transitions replace the document. The held successful response
      // and old bridge listeners are destroyed, not replayed into a new renderer.
      expect(
        await held
          .evaluate(({ state }) => state())
          .then(
            () => false,
            () => true,
          ),
      ).toBe(true);
      await expect(page.getByText(privateBody, { exact: true })).toHaveCount(0);

      // A real peer mutation is the new identity's live-delivery barrier. Do not reconnect
      // here: the production identity transition must establish its own socket.
      const liveName = `identity-${replacement}-live`;
      const live = await callMessaging<{ id: string }>(peer, "createConversation", {
        kind: "channel",
        name: liveName,
      });
      expect(live.error).toBeNull();
      await openIdentityChannel(page, liveName);
      const sent = await callMessaging(peer, "sendMessage", {
        conversationId: live.data!.id,
        body: "New identity live message",
      });
      expect(sent.error).toBeNull();
      await expect(
        page.getByRole("article").filter({ hasText: "New identity live message" }),
      ).toBeVisible();
      await expect(page.getByText(privateBody, { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "identity-owner-private", exact: true }),
      ).toHaveCount(0);
      const denied = await callMessaging(page, "listMessages", { conversationId: privateId });
      expect(denied.data).toBeNull();
      expect(denied.errorCode).toBe("NOT_FOUND");
      expect(await identityProject(page, projectId, current.organizationId)).toEqual({
        success: false,
        hasData: false,
      });
      if (replacement === "workspace") {
        const oldScope = await callMessaging(page, "listMessages", {
          conversationId: privateId,
          organizationId: old.organizationId,
        });
        expect(oldScope.data).toBeNull();
        expect(oldScope.errorCode).not.toBeNull();
      }
      await page
        .getByRole("navigation", { name: "Apps", exact: true })
        .getByRole("button", { name: "Tasks", exact: true })
        .click();
      await expect(page.getByRole("button", { name: "New project", exact: true })).toBeVisible();
      await expect(page.getByText("Identity owner private project", { exact: true })).toHaveCount(
        0,
      );
      await page
        .getByRole("navigation", { name: "Apps", exact: true })
        .getByRole("button", { name: /^Notifications(?:, unread notifications)?$/ })
        .click();
      const notifications = page.getByRole("region", { name: "Notifications", exact: true });
      await expect(notifications.getByText("No notifications yet", { exact: true })).toBeVisible();
      const currentNotifications = await notificationIds(page, current.organizationId);
      expect(currentNotifications.filter((id) => oldNotifications.includes(id))).toEqual([]);
      await expect(
        page.getByText("Identity pending old workspace reply", { exact: true }),
      ).toHaveCount(0);
    } finally {
      if (!oldDocumentGone) {
        await held.evaluate(({ restore }) => restore());
        await events.evaluate(({ stop }) => stop());
      }
      await held.dispose();
      await events.dispose();
    }
  });
}

test("remote browser session revocation removes active native private state and permits normal browser login recovery", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const { page, browser } = desktop;
  await reconnectRealtime(page);
  const channel = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    name: "revoked-native-private",
    private: true,
  });
  expect(channel.error).toBeNull();
  expect(
    (
      await callMessaging(page, "sendMessage", {
        conversationId: channel.data!.id,
        body: "Revoked session confidential content",
      })
    ).error,
  ).toBeNull();
  await openIdentityChannel(page, "revoked-native-private");
  await expect(
    page.getByRole("article").filter({ hasText: "Revoked session confidential content" }),
  ).toBeVisible();
  const native = (await nativeIdentity(page))!;
  const browserSessionResponse = await browser.request.get("/api/v1/session");
  expect(browserSessionResponse.ok()).toBe(true);
  const browserSession: { data: { session: { id: string }; user: { id: string } } } =
    await browserSessionResponse.json();
  expect(browserSession.data.user.id).toBe(native.userId);
  expect(browserSession.data.session.id).not.toBe(native.sessionId);
  const events = await observeRealtime(page);
  let observationStopped = false;
  try {
    // Installed Better Auth 1.7.18 exposes this endpoint. It revokes every session
    // except the calling browser session, without exposing a native token.
    const revoked = await browser.request.post("/api/auth/revoke-other-sessions", {
      headers: { origin: desktop.rendererOrigin },
      data: {},
    });
    expect(revoked.ok(), "The independent browser revokes the native session").toBe(true);
    // A real change forces the hub's per-delivery session check; no heartbeat sleep.
    const changed = await browser.request.post("/api/v1/messaging/messages", {
      headers: { origin: desktop.rendererOrigin },
      data: {
        organizationId: native.organizationId,
        conversationId: channel.data!.id,
        body: "Browser update after native revocation",
      },
    });
    expect(changed.ok(), "The calling browser remains authenticated").toBe(true);
    await expect
      .poll(() =>
        events.evaluate(({ events }) =>
          events.some(
            (event) =>
              event.type === "status" &&
              (event.status === "forbidden" || event.status === "disconnected"),
          ),
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "Sign in with browser", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Revoked session confidential content", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "revoked-native-private", exact: true }),
    ).toHaveCount(0);
    expect(await nativeIdentity(page)).toBeNull();
    const denied = await callMessaging(page, "listMessages", {
      conversationId: channel.data!.id,
      organizationId: native.organizationId,
    });
    expect(denied.data).toBeNull();
    expect(denied.errorCode).not.toBeNull();
    await events.evaluate(({ stop }) => stop());
    observationStopped = true;
    await requestBrowserSignIn(desktop.app, page, browser);
    const callback = await authorizationCallback(browser, () =>
      browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
    );
    await desktop.openLink(callback);
    await expect(
      page.getByRole("button", { name: `${desktop.workspace} ▾`, exact: true }),
    ).toBeVisible();
    const recovered = (await nativeIdentity(page))!;
    expect(recovered.userId).toBe(native.userId);
    expect(recovered.sessionId).not.toBe(native.sessionId);
    await openIdentityChannel(page, "revoked-native-private");
    await expect(
      page.getByRole("article").filter({ hasText: "Revoked session confidential content" }),
    ).toBeVisible();
  } finally {
    if (!observationStopped) await events.evaluate(({ stop }) => stop());
    await events.dispose();
  }
});
