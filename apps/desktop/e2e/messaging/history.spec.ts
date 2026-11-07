import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { waitForRealtimeIdle } from "../test-support/realtime.js";
import { expect } from "@playwright/test";

for (const replies of [false, true]) {
  test(`production ${replies ? "replies" : "messages"} preserve loaded history and show only the requested pagination progress`, async ({
    desktop,
  }) => {
    await desktop.provision();
    const { page } = desktop;
    const created = await callMessaging<{ id: string }>(page, "createConversation", {
      kind: "channel",
      name: "history",
      private: false,
      emails: [],
    });
    expect(created.error).toBeNull();
    const conversationId = created.data!.id;
    let threadId: string | undefined;
    if (replies) {
      const root = await callMessaging<{ id: string }>(page, "sendMessage", {
        conversationId,
        body: "History thread root",
      });
      expect(root.error).toBeNull();
      threadId = root.data!.id;
    }
    for (let index = 0; index < 51; index++) {
      const sent = await callMessaging(page, "sendMessage", {
        conversationId,
        threadId,
        body: `History entry ${index}`,
      });
      expect(sent.error).toBeNull();
    }
    await page.reload();
    await page
      .getByRole("complementary", { name: "Conversations", exact: true })
      .getByRole("button", { name: "history", exact: true })
      .click();
    if (replies) await page.getByRole("button", { name: "51 replies", exact: true }).click();
    const pane = replies
      ? page.getByRole("complementary", { name: "Thread", exact: true })
      : page.getByRole("region", { name: "history", exact: true });
    await expect(pane.getByText("History entry 50", { exact: true })).toBeVisible();
    await waitForRealtimeIdle(page);
    // Hold renderer fetches before they enter Electron's native protocol transport.
    const requests = await page.evaluateHandle(
      ({ conversationId, threadId }) => {
        const original = window.fetch;
        let direction: "older" | "latest" = "older";
        let release!: () => void;
        let held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let blocked = 0;
        window.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
          const input = args[0];
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          if (
            url.pathname === "/api/v1/messaging/messages" &&
            url.searchParams.get("conversationId") === conversationId &&
            (url.searchParams.get("threadId") ?? undefined) === threadId &&
            url.searchParams.has("beforeMessageId") === (direction === "older")
          ) {
            blocked++;
            await held;
          }
          return original(...args);
        }, original);
        return {
          blocked: () => blocked,
          release: () => release(),
          holdLatest: () => {
            direction = "latest";
            blocked = 0;
            held = new Promise<void>((resolve) => {
              release = resolve;
            });
          },
          restore: () => {
            window.fetch = original;
            release();
          },
        };
      },
      { conversationId, threadId },
    );
    try {
      await pane
        .getByRole("button", { name: replies ? "Older replies" : "Older messages", exact: true })
        .click();
      await expect.poll(() => requests.evaluate((control) => control.blocked())).toBeGreaterThan(0);
      const loadingOlder = pane.getByRole("button", {
        name: replies ? "Loading older replies…" : "Loading older messages…",
        exact: true,
      });
      await expect(loadingOlder).toBeDisabled();
      await expect(loadingOlder).toHaveAttribute("aria-busy", "true");
      await expect(
        pane.getByRole("button", {
          name: replies ? "Latest replies" : "Back to latest",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(pane.getByRole("button", { name: /Loading latest/ })).toHaveCount(0);
      await expect(pane.getByText("History entry 50", { exact: true })).toBeVisible();
      await requests.evaluate((control) => control.release());
      await expect(pane.getByText("History entry 0", { exact: true })).toBeVisible();
      await expect(loadingOlder).toHaveCount(0);
      await waitForRealtimeIdle(page);
      await requests.evaluate((control) => control.holdLatest());
      await pane
        .getByRole("button", { name: replies ? "Latest replies" : "Back to latest", exact: true })
        .click();
      await expect.poll(() => requests.evaluate((control) => control.blocked())).toBeGreaterThan(0);
      const loadingLatest = pane.getByRole("button", {
        name: replies ? "Loading latest replies…" : "Loading latest messages…",
        exact: true,
      });
      await expect(loadingLatest).toBeDisabled();
      await expect(loadingLatest).toHaveAttribute("aria-busy", "true");
      await expect(pane.getByRole("button", { name: /Loading older/ })).toHaveCount(0);
      await expect(
        pane.getByRole("log", { name: "Messages", exact: true }).getByRole("article"),
      ).not.toHaveCount(0);
      await requests.evaluate((control) => control.release());
      await expect(loadingLatest).toHaveCount(0);
      await expect(pane.getByText("History entry 50", { exact: true })).toBeVisible();
      await expect(
        pane.getByRole("button", {
          name: replies ? "Older replies" : "Older messages",
          exact: true,
        }),
      ).toBeEnabled();
    } finally {
      await requests.evaluate((control) => control.restore());
      await requests.dispose();
    }
  });
}
