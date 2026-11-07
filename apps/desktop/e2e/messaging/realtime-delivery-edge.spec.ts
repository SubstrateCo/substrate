import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import {
  observeRealtime,
  reconnectRealtime,
  waitForRealtimeIdle,
} from "../test-support/realtime.js";
import { expect, type Page } from "@playwright/test";

type Message = {
  id: string;
  body: string;
  replyCount: number;
  reactions: { emoji: string; count: number; reacted: boolean }[];
};

async function openChannel(page: Page, name: string) {
  await page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function send(page: Page, name: string, body: string) {
  const composer = page.getByRole("textbox", { name, exact: true });
  await composer.fill(body);
  await composer.press("Enter");
  await expect(composer).toHaveText("");
}

test("a committed send with a lost HTTP acknowledgement retries the original request without duplicates", async ({
  desktop,
  desktopPeer,
}) => {
  test.setTimeout(180_000);
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  const sender = desktop.page;
  const receiver = desktopPeer.page;
  await Promise.all([reconnectRealtime(sender), reconnectRealtime(receiver)]);
  const name = "lost-ack-delivery";
  const created = await callMessaging<{ id: string }>(sender, "createConversation", {
    kind: "channel",
    name,
    private: true,
    emails: [desktopPeer.owner.email],
  });
  expect(created.error).toBeNull();
  const conversationId = created.data!.id;
  await Promise.all([openChannel(sender, name), openChannel(receiver, name)]);
  const body = "Committed once despite the lost acknowledgement";
  const transport = await sender.evaluateHandle(
    ({ conversationId, body }) => {
      const original = window.fetch;
      const attempts: { requestId?: string; id: string; body: string }[] = [];
      window.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
        const request = new Request(args[0], args[1]);
        const url = new URL(request.url);
        if (request.method !== "POST" || url.pathname !== "/api/v1/messaging/messages")
          return original(...args);
        const input = await request.clone().json();
        if (input.conversationId !== conversationId || input.body !== body)
          return original(...args);
        const response = await original(...args);
        const result = await response.clone().json();
        if (!response.ok || !result.success) throw new Error("The real send did not commit");
        attempts.push({ requestId: input.requestId, id: result.data.id, body: result.data.body });
        // Consume the real successful response before simulating loss of its acknowledgement.
        if (attempts.length === 1) throw new TypeError("Failed to fetch");
        return response;
      }, original);
      return {
        attempts,
        restore: () => {
          window.fetch = original;
        },
      };
    },
    { conversationId, body },
  );
  try {
    const composer = sender.getByRole("textbox", { name: `Message #${name}`, exact: true });
    const form = composer.locator("xpath=ancestor::form");
    await composer.fill(body);
    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(composer).toHaveText(body);
    await expect(composer).toBeEditable();
    const received = receiver.getByRole("article").filter({ hasText: body });
    await expect(received).toHaveCount(1);
    const committed = await callMessaging<Message[]>(receiver, "listMessages", { conversationId });
    expect(committed.error).toBeNull();
    expect(committed.data!.filter((message) => message.body === body)).toHaveLength(1);
    const canonicalId = committed.data!.find((message) => message.body === body)!.id;

    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(composer).toHaveText("");
    await expect(form.getByRole("alert")).toHaveCount(0);
    await expect(composer).toBeEditable();
    const attempts = await transport.evaluate(({ attempts }) => attempts);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.requestId).toEqual(expect.any(String));
    expect(attempts[0]!.requestId).not.toBe("");
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]!.id).toBe(canonicalId);
    for (const page of [sender, receiver]) {
      const listed = await callMessaging<Message[]>(page, "listMessages", { conversationId });
      expect(listed.error).toBeNull();
      expect(listed.data!.map(({ id, body }) => ({ id, body }))).toEqual([
        { id: canonicalId, body },
      ]);
      await expect(page.getByRole("article").filter({ hasText: body })).toHaveCount(1);
    }
    // Revisit through real navigation: successful retry must clear the saved draft too.
    await sender
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: /^Notifications(?:, unread notifications)?$/ })
      .click();
    await sender
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: "Messages", exact: true })
      .click();
    await openChannel(sender, name);
    await expect(composer).toHaveText("");
  } finally {
    await transport.evaluate(({ restore }) => restore());
    await transport.dispose();
  }
});

test("bounded concurrent roots, replies and reactions converge live with unread notifications and stable history scroll", async ({
  desktop,
  desktopPeer,
}) => {
  test.setTimeout(180_000);
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  const viewer = desktop.page;
  const writer = desktopPeer.page;
  await Promise.all([reconnectRealtime(viewer), reconnectRealtime(writer)]);
  const name = "burst-delivery";
  const created = await callMessaging<{ id: string }>(viewer, "createConversation", {
    kind: "channel",
    name,
    private: true,
    emails: [desktopPeer.owner.email],
  });
  expect(created.error).toBeNull();
  const conversationId = created.data!.id;
  await Promise.all([openChannel(viewer, name), openChannel(writer, name)]);
  await send(viewer, `Message #${name}`, "Burst thread anchor");
  const initial = await callMessaging<Message[]>(viewer, "listMessages", { conversationId });
  expect(initial.error).toBeNull();
  const threadId = initial.data![0]!.id;
  const root = viewer
    .getByRole("region", { name, exact: true })
    .getByRole("article")
    .filter({ hasText: "Burst thread anchor" });
  await root.hover();
  await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const thread = viewer.getByRole("complementary", { name: "Thread", exact: true });
  await expect(
    thread.getByRole("textbox", { name: "Reply in thread…", exact: true }),
  ).toBeVisible();

  // Native renderer HTTP writes, at most eight in flight. Bodies are unique; order is server order.
  const write = async (phase: "seed" | "burst") =>
    writer.evaluate(
      async ({ conversationId, threadId, phase }) => {
        const session = await (await fetch("/api/v1/session")).json();
        const organizationId = session.data.session.activeOrganizationId;
        const jobs =
          phase === "seed"
            ? Array.from({ length: 12 }, (_, index) => ({
                endpoint: "messages",
                data: {
                  body: `Old history ${String(index).padStart(2, "0")}\n${"Older content to preserve. ".repeat(16)}`,
                },
              }))
            : [
                ...Array.from({ length: 20 }, (_, index) => ({
                  endpoint: "messages",
                  data: {
                    body: `Burst root ${String(index).padStart(2, "0")}`,
                  },
                })),
                ...Array.from({ length: 20 }, (_, index) => ({
                  endpoint: "messages",
                  data: {
                    threadId,
                    body: `Burst reply ${String(index).padStart(2, "0")}`,
                  },
                })),
                ...["👍", "🎉", "🚀"].map((emoji) => ({
                  endpoint: "reactions",
                  data: { messageId: threadId, emoji },
                })),
              ];
        const results: { id: string }[] = [];
        // Interleave roots and replies so refreshes must reconcile both mounted lists.
        if (phase === "burst")
          jobs.sort((a, b) => {
            const index = (job: typeof a) =>
              "body" in job.data ? Number(job.data.body.slice(-2)) : 20;
            return index(a) - index(b);
          });
        let next = 0;
        await Promise.all(
          Array.from({ length: 8 }, async () => {
            while (next < jobs.length) {
              const job = jobs[next++]!;
              const response = await fetch(`/api/v1/messaging/${job.endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organizationId, conversationId, ...job.data }),
              });
              const result = await response.json();
              if (!response.ok || !result.success) throw new Error(JSON.stringify(result));
              results.push(result.data);
            }
          }),
        );
        return results.length;
      },
      { conversationId, threadId, phase },
    );
  expect(await write("seed")).toBe(12);
  const channel = viewer.getByRole("region", { name, exact: true });
  const log = channel.getByRole("log", { name: "Messages", exact: true });
  await expect(channel.getByRole("article")).toHaveCount(13);
  await log.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect
    .poll(() => log.evaluate((node) => node.scrollHeight - node.clientHeight))
    .toBeGreaterThan(100);
  await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBe(0);
  const before = await root.boundingBox();
  expect(before).not.toBeNull();
  const events = await observeRealtime(viewer);
  const requests = await viewer.evaluateHandle(() => {
    const original = window.fetch;
    const reads: string[] = [];
    window.fetch = Object.assign((...args: Parameters<typeof fetch>) => {
      const request = new Request(args[0], args[1]);
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/api/v1/messaging/messages")
        reads.push(url.searchParams.get("threadId") ?? "channel");
      return original(...args);
    }, original);
    return {
      reads,
      restore: () => {
        window.fetch = original;
      },
    };
  });
  try {
    expect(await write("burst")).toBe(43);
    await expect(channel.getByRole("article")).toHaveCount(33);
    await expect(thread.getByRole("article").filter({ hasText: /Burst reply \d{2}/ })).toHaveCount(
      20,
    );
    await expect(root.getByRole("button", { name: "20 replies", exact: true })).toBeVisible();
    for (const emoji of ["👍", "🎉", "🚀"]) {
      await expect(
        root.getByRole("button", { name: `${emoji}, 1 reactions`, exact: true }),
      ).toBeVisible();
    }
    await expect
      .poll(() =>
        events.evaluate(
          ({ events }, conversationId) =>
            events.filter(
              (event) =>
                event.type === "change" &&
                event.domain === "messaging" &&
                event.conversationId === conversationId,
            ).length,
          conversationId,
        ),
      )
      .toBeGreaterThanOrEqual(43);
    await waitForRealtimeIdle(viewer);
    const reads = await requests.evaluate(({ reads }) => reads);
    // Each independently fetched feed must coalesce the 43-event burst.
    const channelReads = reads.filter((key) => key === "channel").length;
    const threadReads = reads.filter((key) => key === threadId).length;
    console.log(`43-event burst message GETs: channel=${channelReads}, thread=${threadReads}`);
    expect(channelReads).toBeGreaterThan(0);
    expect(channelReads, "The channel feed must coalesce the 43-event burst").toBeLessThan(43);
    expect(threadReads).toBeGreaterThan(0);
    expect(threadReads, "The thread feed must coalesce the 43-event burst").toBeLessThan(43);
    await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBe(0);
    expect((await root.boundingBox())!.y).toBeCloseTo(before!.y, 0);

    for (const page of [viewer, writer]) {
      const listed = await callMessaging<Message[]>(page, "listMessages", { conversationId });
      const replies = await callMessaging<Message[]>(page, "listMessages", {
        conversationId,
        threadId,
      });
      expect(listed.error).toBeNull();
      expect(replies.error).toBeNull();
      expect(listed.data).toHaveLength(33);
      expect(replies.data).toHaveLength(20);
      expect(new Set(listed.data!.map(({ id }) => id)).size).toBe(33);
      expect(new Set(replies.data!.map(({ id }) => id)).size).toBe(20);
      expect(listed.data!.find(({ id }) => id === threadId)!.replyCount).toBe(20);
      const reactions = listed.data!.find(({ id }) => id === threadId)!.reactions;
      expect(reactions).toHaveLength(3);
      expect(reactions).toEqual(
        expect.arrayContaining(
          ["👍", "🎉", "🚀"].map((emoji) => ({
            emoji,
            count: 1,
            reacted: page === writer,
          })),
        ),
      );
      const timeline = page.getByRole("region", { name, exact: true }).getByRole("article");
      await expect(timeline).toHaveCount(33);
      const bodies = await timeline.allTextContents();
      expect(
        bodies.map(
          (text) => text.match(/Burst thread anchor|Old history \d{2}|Burst root \d{2}/)?.[0],
        ),
      ).toEqual(listed.data!.map(({ body }) => body.split("\n")[0]));
      if (page === viewer) {
        const rendered = await thread
          .getByRole("article")
          .filter({ hasText: /Burst reply \d{2}/ })
          .allTextContents();
        expect(rendered.map((text) => text.match(/Burst reply \d{2}/)?.[0])).toEqual(
          replies.data!.map(({ body }) => body),
        );
      }
    }
    await viewer
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: /^Notifications(?:, unread notifications)?$/ })
      .click();
    const notifications = viewer.getByRole("region", { name: "Notifications", exact: true });
    await expect(
      notifications.getByRole("listitem").filter({ hasText: "New thread reply" }),
    ).toHaveCount(20);
    await expect(notifications.getByRole("button", { name: /^Unread/ })).toHaveText("Unread 20");
    await expect(notifications.getByText("Read", { exact: true })).toHaveCount(0);
  } finally {
    await requests.evaluate(({ restore }) => restore());
    await requests.dispose();
    await events.evaluate(({ stop }) => stop());
    await events.dispose();
  }
});
