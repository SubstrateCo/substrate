import { inboxLaneAgingMs, sessionKeys } from "@substrate/contracts/agent-work";

import { registerDevice } from "../../../core/devices/repository";
import { agentTurns, userAgents } from "../../../schema";
import { setupDatabase } from "../../../testing/database";
import { hostFixture, soon } from "../../../testing/host";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

const routineRef = () => ({
  source: "routine" as const,
  routineId: crypto.randomUUID(),
  revision: 1,
  scheduledAt: new Date().toISOString(),
});

test("a claim batches the session's owner messages into one interactive turn leased by the device", async () => {
  const x = await hostFixture(f);
  const first = await x.alice.sendMessage(x.dm.id, "Summarize the week");
  const second = await x.alice.sendMessage(x.dm.id, "Include risks");
  expect(await x.claim({}, new Date())).toEqual([]);
  const now = soon();
  const [claimed, ...rest] = await x.claim({}, now);
  expect(rest).toEqual([]);
  expect(claimed!.turn).toMatchObject({
    kind: "interactive",
    status: "assigned",
    attempt: 1,
    handoff: false,
    folderKey: `main:${x.agent.agentId}`,
    leaseExpiresAt: new Date(now.getTime() + 3 * 60_000).toISOString(),
  });
  expect(claimed!.session).toMatchObject({
    key: sessionKeys.dm(x.dm.id),
    origin: { conversationId: x.dm.id, threadId: null },
    resetGeneration: 0,
  });
  expect(claimed!.items.map((item) => [item.sourceRef, item.status, item.body])).toEqual(
    [first, second].map((message) => [
      { source: "owner_message", messageId: message.id, conversationId: x.dm.id, threadId: null },
      "submitted",
      null,
    ]),
  );
  expect((await x.turnRow(claimed!.turn.id)).leaseDeviceId).toBe(x.agent.device.id);
});

test("one live turn per folder: the agent's other session waits for its main folder", async () => {
  const x = await hostFixture(f);
  const routine = await x.session({
    key: sessionKeys.routine(crypto.randomUUID()),
    kind: "routine",
  });
  await x.item(routine, routineRef());
  await x.alice.sendMessage(x.dm.id, "Hello");
  const [first] = await x.claim();
  expect(first!.session.key).toBe(sessionKeys.dm(x.dm.id));
  expect(await x.claim()).toEqual([]);
  await f.db
    .update(agentTurns)
    .set({ status: "completed" })
    .where(eq(agentTurns.id, first!.turn.id));
  expect(await x.claim({ busyFolders: [`main:${x.agent.agentId}`] })).toEqual([]);
  expect((await x.claim()).map((turn) => turn.session.key)).toEqual([routine.key]);
});

test("a device runs at most three live turns, and only its own homed, enabled agents", async () => {
  const x = await hostFixture(f);
  const agents = [x.agent, ...(await Promise.all(["B", "C", "D"].map((name) => x.sibling(name))))];
  for (const agent of agents) {
    const routine = await x.session(
      { key: sessionKeys.routine(crypto.randomUUID()), kind: "routine" },
      agent,
    );
    await x.item(routine, routineRef());
  }
  const laptop = await registerDevice(f.db, "alice", {
    installationId: crypto.randomUUID(),
    name: "Other laptop",
    platform: "win32",
  });
  expect(await x.claim({}, soon(), { ...x.identity, deviceId: laptop.id })).toEqual([]);
  await f.db
    .update(userAgents)
    .set({ enabled: false })
    .where(eq(userAgents.id, agents[3]!.agentId));
  expect(await x.claim()).toHaveLength(3);
  await f.db.update(userAgents).set({ enabled: true }).where(eq(userAgents.id, agents[3]!.agentId));
  expect(await x.claim()).toEqual([]);
});

test("a batch holds at most 20 items; the rest wait for the next turn", async () => {
  const x = await hostFixture(f);
  const routine = await x.session({
    key: sessionKeys.routine(crypto.randomUUID()),
    kind: "routine",
  });
  for (let index = 0; index < 22; index++) await x.item(routine, routineRef());
  const [turn] = await x.claim();
  expect(turn!.items).toHaveLength(20);
  expect((await x.items()).filter((item) => item.status === "pending")).toHaveLength(2);
});

test("owner work goes first, and background work moves up a lane for every 10 minutes it waits", async () => {
  const x = await hostFixture(f);
  const routine = await x.session({
    key: sessionKeys.routine(crypto.randomUUID()),
    kind: "routine",
  });
  const now = soon();
  const tick = await x.item(routine, routineRef(), {
    availableAt: new Date(now.getTime() - inboxLaneAgingMs),
  });
  await x.alice.sendMessage(x.dm.id, "Hello");
  expect((await x.claim({}, now)).map((turn) => turn.session.key)).toEqual([
    sessionKeys.dm(x.dm.id),
  ]);
  await f.db.update(agentTurns).set({ status: "completed" });
  await x.alice.sendMessage(x.dm.id, "Again");
  const later = new Date(now.getTime() + inboxLaneAgingMs);
  expect((await x.claim({}, later)).map((turn) => turn.items.map((item) => item.id))).toEqual([
    [tick.id],
  ]);
});

test("a session whose turn needs the owner waits until the owner resolves it", async () => {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "First");
  const [turn] = await x.claim();
  await f.db
    .update(agentTurns)
    .set({ status: "needs_attention", leaseDeviceId: null, leaseExpiresAt: null })
    .where(eq(agentTurns.id, turn!.turn.id));
  await x.alice.sendMessage(x.dm.id, "Second");
  expect(await x.claim()).toEqual([]);
});

test("a pending epoch handoff runs alone as an unattended handoff turn", async () => {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Owner message");
  const session = await x.session({ key: sessionKeys.dm(x.dm.id), kind: "dm" });
  const epoch = await x.item(session, { source: "epoch", fromEpoch: 0 }, { body: "Hand off" });
  const [handoff] = await x.claim();
  expect(handoff!.turn).toMatchObject({ handoff: true, kind: "unattended" });
  expect(handoff!.items.map((item) => [item.id, item.body])).toEqual([[epoch.id, "Hand off"]]);
});

test("a helper session's turn is unattended and runs in the helper's own folder", async () => {
  const x = await hostFixture(f);
  const parent = await x.session({ key: sessionKeys.dm(x.dm.id), kind: "dm" });
  const helperId = crypto.randomUUID();
  const helper = await x.session({
    key: sessionKeys.helper(helperId),
    kind: "helper",
    parentSessionId: parent.id,
  });
  await x.item(helper, {
    source: "owner_message",
    messageId: crypto.randomUUID(),
    conversationId: x.dm.id,
    threadId: null,
  });
  await x.alice.sendMessage(x.dm.id, "Parent work");
  const turns = await x.claim();
  expect(turns.map((turn) => [turn.turn.folderKey, turn.turn.kind])).toEqual([
    [`main:${x.agent.agentId}`, "interactive"],
    [`helper:${helperId}`, "unattended"],
  ]);
  expect(turns[1]!.session.helperId).toBe(helperId);
});

test("an agent without a home that has work waiting moves to the claiming device", async () => {
  const x = await hostFixture(f);
  await f.db
    .update(userAgents)
    .set({ homeDeviceId: null })
    .where(eq(userAgents.id, x.agent.agentId));
  await x.alice.sendMessage(x.dm.id, "Hello");
  expect(await x.claim()).toHaveLength(1);
  const [agent] = await f.db.select().from(userAgents).where(eq(userAgents.id, x.agent.agentId));
  expect(agent!.homeDeviceId).toBe(x.agent.device.id);
});
