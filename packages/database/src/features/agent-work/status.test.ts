import { agentStatus } from "../../schema";
import { agentWorkFixture, deviceAgentWork, ownerAgentWork } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { expect, test } from "bun:test";

const f = setupDatabase();

async function sharedThread() {
  const fixture = await agentWorkFixture(f);
  const shared = await fixture.bob.createConversation({
    kind: "channel",
    name: "secret-plans",
    private: true,
    emails: ["alice@example.com"],
  });
  const root = await fixture.bob.sendMessage(shared.id, "Secret root");
  return { ...fixture, shared, root };
}

test("after the owner leaves the live conversation, status shows no place and no activity", async () => {
  const { agent, alice, owner, shared, root } = await sharedThread();
  const device = await deviceAgentWork(f.db, agent.identity);
  const work = await ownerAgentWork(f.db, owner);
  const publish = (version: number, state: "working" | "needs_you" = "working") =>
    device.publishStatus({
      userAgentId: agent.agentId,
      state,
      queuedCount: 0,
      liveConversationId: shared.id,
      liveThreadId: root.id,
      activity: "Reading the secret launch notes",
      version,
    });
  await publish(1);
  expect((await work.listStatus())[0]).toMatchObject({
    liveConversationId: shared.id,
    liveThreadId: root.id,
    activity: "Reading the secret launch notes",
  });

  await alice.leaveConversation(shared.id);
  const hidden = { liveConversationId: null, liveThreadId: null, activity: null };
  expect((await work.listStatus())[0]).toMatchObject(hidden);
  // A later publish for the hidden place stores neither the place nor the activity.
  await publish(2, "needs_you");
  const [row] = await f.db.select().from(agentStatus);
  expect(row).toMatchObject(hidden);
  const needsYou = await work.listNeedsYou();
  expect(needsYou.agents[0]).toMatchObject(hidden);
  const text = JSON.stringify([await work.listStatus(), needsYou]);
  for (const secret of ["secret", shared.id, root.id]) expect(text).not.toContain(secret);
});

test("millisecond status versions from the desktop clock are stored, and older ones change nothing", async () => {
  const { agent, owner } = await agentWorkFixture(f);
  const device = await deviceAgentWork(f.db, agent.identity);
  const work = await ownerAgentWork(f.db, owner);
  const publish = (version: number, state: "working" | "idle") =>
    device.publishStatus({
      userAgentId: agent.agentId,
      state,
      queuedCount: 0,
      version,
    });
  const now = Date.UTC(2026, 10, 9);
  await publish(now, "working");
  await publish(now - 1, "idle");
  expect((await work.listStatus())[0]).toMatchObject({ state: "working" });
  await publish(now + 1, "idle");
  expect((await work.listStatus())[0]).toMatchObject({ state: "idle" });
});

test("a publish reports a change only when what the owner sees changed", async () => {
  const { agent, alice } = await agentWorkFixture(f);
  const device = await deviceAgentWork(f.db, agent.identity);
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  let version = 0;
  const publish = async (input: { state?: "working" | "idle"; activity?: string }) =>
    (
      await device.publishStatus({
        userAgentId: agent.agentId,
        state: input.state ?? "working",
        queuedCount: 0,
        liveConversationId: channel.id,
        activity: input.activity,
        version: ++version,
      })
    ).result;
  const results = [];
  // A republish of the same status, then an activity change, then a state change.
  for (const input of [
    { activity: "Reading" },
    { activity: "Reading" },
    { activity: "Drafting" },
    { state: "idle" as const, activity: "Drafting" },
  ])
    results.push(await publish(input));
  expect(results).toEqual([
    { applied: true, changed: true },
    { applied: true, changed: false },
    { applied: true, changed: true },
    { applied: true, changed: true },
  ]);
  version = 0;
  expect(await publish({ state: "working" })).toEqual({ applied: false, changed: false });
});

test("status without a place keeps its activity, and a thread outside the conversation is dropped", async () => {
  const { agent, alice, owner, root } = await sharedThread();
  const device = await deviceAgentWork(f.db, agent.identity);
  const work = await ownerAgentWork(f.db, owner);
  await device.publishStatus({
    userAgentId: agent.agentId,
    state: "working",
    queuedCount: 1,
    activity: "Running the weekly routine",
    version: 1,
  });
  expect((await work.listStatus())[0]?.activity).toBe("Running the weekly routine");

  // The root belongs to another conversation, so it is not this conversation's thread.
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  await device.publishStatus({
    userAgentId: agent.agentId,
    state: "working",
    queuedCount: 0,
    liveConversationId: channel.id,
    liveThreadId: root.id,
    activity: "Drafting",
    version: 2,
  });
  expect((await work.listStatus())[0]).toMatchObject({
    liveConversationId: channel.id,
    liveThreadId: null,
    activity: "Drafting",
  });
});
