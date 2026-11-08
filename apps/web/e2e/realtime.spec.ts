import { conversation, expectChange, post, send, test, visit } from "./test-support/fixtures";
import { expect, type WebSocketRoute } from "@playwright/test";

test("reconnect resyncs messages missed while the socket was disconnected", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const [sender, recipient] = await Promise.all([client(actors.sender), client(actors.member)]);
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
