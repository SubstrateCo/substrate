import { sessionKeys } from "@substrate/contracts/agent-work";

import { registerDevice } from "../../../core/devices/repository";
import { hostWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { hostFixture } from "../../../testing/host";
import { createMessagingService } from "../../messaging/service";
import { ownerBatchWindowMs, ownerMessageDebounceMs } from "../items";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("owner messages debounce: each moves the open batch out, up to the batch window", async () => {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "One");
  const [first] = await x.items();
  expect(first!.availableAt.getTime() - first!.createdAt.getTime()).toBe(ownerMessageDebounceMs);
  expect(first!.deadlineAt.getTime() - first!.createdAt.getTime()).toBe(ownerBatchWindowMs);
  await x.alice.sendMessage(x.dm.id, "Two");
  const [moved, second] = await x.items();
  // Both wait for the newest message, and the batch keeps its first deadline.
  expect(moved!.availableAt).toEqual(second!.availableAt);
  expect(second!.availableAt.getTime() - second!.createdAt.getTime()).toBeLessThanOrEqual(
    ownerMessageDebounceMs,
  );
  expect(second!.deadlineAt).toEqual(first!.deadlineAt);
  expect((await x.claim())[0]!.items).toHaveLength(2);
});

async function liveThreadTurn() {
  const x = await hostFixture(f);
  const channel = await x.alice.createConversation({
    kind: "channel",
    name: "planning",
    emails: ["bob@example.com"],
  });
  await x.alice.addAgent(channel.id, x.agent.agentId);
  const root = await x.alice.sendMessage(channel.id, `@[agent:${x.agent.actorId}] Plan it`);
  const [claimed] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  await host.start(claimed!.turn.id, { attempt: 1, droppedItemIds: [] });
  const passive = async () => (await x.items()).filter((item) => item.source === "thread_context");
  return { ...x, channel, root, claimed: claimed!, host, passive };
}

test("other people's and other agents' thread messages join the live thread turn as passive context", async () => {
  const x = await liveThreadTurn();
  expect(x.claimed.session.key).toBe(sessionKeys.thread(x.root.id));
  const first = await x.bob.sendMessage(x.channel.id, "I have numbers", x.root.id);
  const second = await x.bob.sendMessage(x.channel.id, "And a chart", x.root.id);
  const [batch, ...rest] = await x.passive();
  expect(rest).toEqual([]);
  expect(batch).toMatchObject({
    turnId: x.claimed.turn.id,
    lane: "background",
    sourceRef: {
      source: "thread_context",
      messageIds: [first.id, second.id],
      targetTurnId: x.claimed.turn.id,
      conversationId: x.channel.id,
      threadId: x.root.id,
    },
  });
  // The agent's own messages are never context for itself.
  await createMessagingService(f.db, x.agentIdentity).sendMessage(x.channel.id, "Mine", x.root.id);
  expect((await x.passive())[0]!.sourceRef).toMatchObject({ messageIds: [first.id, second.id] });
  // The turn's end drops passive context it did not take.
  await x.host.finish(x.claimed.turn.id, {
    attempt: 1,
    status: "completed",
    outcome: "replied",
    error: null,
    attentionReason: null,
    interruption: null,
    consumedItemIds: [],
    stillQueuedItemIds: [],
    usage: null,
  });
  expect(await x.itemRow(batch!.id)).toMatchObject({ status: "dropped", reason: "turn_finished" });
  // Passive context never starts a turn.
  const session = await x.session({ key: x.claimed.session.key, kind: "thread" });
  await x.item(session, { ...batch!.sourceRef }, { availableAt: new Date(0) });
  expect(await x.claim()).toEqual([]);
  // Without a live turn, another person's message adds nothing.
  const after = await x.bob.sendMessage(x.channel.id, "After the turn", x.root.id);
  expect(JSON.stringify(await x.items())).not.toContain(after.id);
});

test("an epoch handoff is admitted only from the agent's home device, once per epoch", async () => {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Hello");
  const session = await x.session({ key: sessionKeys.dm(x.dm.id), kind: "dm" });
  const input = { sessionId: session.id, fromEpoch: 0, body: "Hand off your notes." };
  const installationId = crypto.randomUUID();
  await registerDevice(f.db, "alice", { installationId, name: "Other", platform: "linux" });
  const other = await hostWork(f.db, { ...x.agent.identity, installationId });
  expect((await other.submitEpoch(input)).result).toEqual({ created: false });
  const home = await hostWork(f.db, x.agent.identity);
  expect((await home.submitEpoch(input)).result).toEqual({ created: true });
  expect((await home.submitEpoch(input)).result).toEqual({ created: false });
  const epochs = (await x.items()).filter((item) => item.source === "epoch");
  expect(epochs.map((item) => [item.lane, item.body])).toEqual([["system", input.body]]);
});
