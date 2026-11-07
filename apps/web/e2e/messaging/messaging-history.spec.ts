import { callMessaging } from "../test-support/api";
import { provisionVerifiedAccount } from "../test-support/auth";
import { Mailpit } from "../test-support/mailpit";
import { provisionWorkspace } from "../test-support/organizations";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

for (const replies of [false, true]) {
  test(`production ${replies ? "replies" : "messages"} preserve loaded history and show only the requested pagination progress`, async ({
    page,
    request,
  }) => {
    const suffix = randomUUID();
    await provisionVerifiedAccount(page, new Mailpit(request), {
      name: "History reviewer",
      email: `history-${suffix}@example.test`,
      password: `History-${randomUUID()}!`,
    });
    await provisionWorkspace(page, `History ${suffix}`, `history-${suffix}`);
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
    await page.clock.install();
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
    let direction: "older" | "latest" | "refresh" = "older";
    let release: () => void = () => {};
    let held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/messaging/messages?*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.searchParams.get("conversationId") === conversationId &&
        (url.searchParams.get("threadId") ?? undefined) === threadId &&
        (direction !== "older" || url.searchParams.has("beforeMessageId"))
      )
        await held;
      await route.continue();
    });
    await pane
      .getByRole("button", { name: replies ? "Older replies" : "Older messages", exact: true })
      .click();
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
    release();
    await expect(pane.getByText("History entry 0", { exact: true })).toBeVisible();
    await expect(loadingOlder).toHaveCount(0);
    direction = "latest";
    held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await pane
      .getByRole("button", { name: replies ? "Latest replies" : "Back to latest", exact: true })
      .click();
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
    release();
    await expect(loadingLatest).toHaveCount(0);
    await expect(pane.getByText("History entry 50", { exact: true })).toBeVisible();
    direction = "refresh";
    held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.clock.fastForward(3000);
    await expect(
      pane
        .getByRole("status")
        .filter({ hasText: replies ? "Refreshing replies…" : "Refreshing messages…" }),
    ).toBeVisible();
    await expect(pane.getByRole("button", { name: /Loading (older|latest)/ })).toHaveCount(0);
    await expect(pane.getByText("History entry 50", { exact: true })).toBeVisible();
    release();
    await expect(
      pane.getByRole("button", { name: replies ? "Older replies" : "Older messages", exact: true }),
    ).toBeEnabled();
  });
}
