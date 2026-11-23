import {
  conversation,
  expectChange,
  isolateContext,
  post,
  send,
  test,
  visit,
} from "./test-support/fixtures";
import { expect, type WebSocketRoute } from "@playwright/test";

test("a connected client recovers a committed message when its change hint is lost", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const recipient = await client(actors.member);
  isolateContext(recipient.page);
  await recipient.page.clock.install();
  await recipient.page.routeWebSocket("**/api/v1/realtime?*", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const event = JSON.parse(message.toString());
      if (event.type !== "change") socket.send(message);
    });
  });
  await visit(recipient, channel.id);
  const readyBefore = recipient.events.filter((event) => event.type === "ready").length;
  const body = `Committed without a delivered hint ${channel.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: channel.id, body });
  await expect(recipient.page.getByText(body, { exact: true })).toHaveCount(0);
  await recipient.page.clock.fastForward(30_000);
  await expect(recipient.page.getByText(body, { exact: true })).toBeVisible();
  expect(recipient.events.filter((event) => event.type === "ready")).toHaveLength(readyBefore);
});

test("reconnect resyncs messages missed while the socket was disconnected", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const [sender, recipient] = await Promise.all([client(actors.sender), client(actors.member)]);
  const initial = `Loaded before disconnect ${channel.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: channel.id, body: initial });
  let upstream: WebSocketRoute | undefined;
  let downstream: WebSocketRoute | undefined;
  let resume!: () => void;
  const resumed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let connections = 0;
  let paused = false;
  await recipient.page.routeWebSocket("**/api/v1/realtime?*", async (socket) => {
    // Forward real traffic, but hold the replacement connection until after the missed write.
    connections++;
    if (paused) await resumed;
    downstream = socket;
    upstream = socket.connectToServer();
  });
  await Promise.all([visit(sender, channel.id), visit(recipient, channel.id)]);
  // Ready can precede the conversation's first HTTP read. Load history before missing a write.
  await expect(recipient.page.getByText(initial, { exact: true })).toBeVisible();
  await expect(sender.page.getByText(initial, { exact: true })).toBeVisible();
  const readyBefore = recipient.events.filter((event) => event.type === "ready").length;
  const connectionsBefore = connections;
  paused = true;
  await Promise.all([
    downstream!.close({ code: 1012, reason: "E2E connection interruption" }),
    upstream!.close({ code: 1012, reason: "E2E connection interruption" }),
  ]);
  await expect(
    recipient.page.getByText(/Live updates disconnected|Reconnecting to live updates/),
  ).toBeVisible();
  const missed = `Missed while disconnected ${channel.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: channel.id, body: missed });
  await expect.poll(() => connections).toBeGreaterThan(connectionsBefore);
  await expect(recipient.page.getByText(missed, { exact: true })).toHaveCount(0);
  paused = false;
  resume();
  await expect
    .poll(() => recipient.events.filter((event) => event.type === "ready").length)
    .toBeGreaterThan(readyBefore);
  await expect(recipient.page.getByText(missed, { exact: true })).toBeVisible();
  const since = recipient.events.length;
  const live = `Live after reconnect ${channel.id}`;
  await send(sender.page, live);
  await expect(recipient.page.getByText(live, { exact: true })).toBeVisible();
  await expectChange(recipient, since, "messaging", channel.id);
});
