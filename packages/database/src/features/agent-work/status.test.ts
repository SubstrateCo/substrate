import { agentStatus } from "../../schema";
import { agentWorkFixture } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { listNeedsYou } from "./request-views";
import { listStatus, publishStatus } from "./status";
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
  const publish = (version: number, state: "working" | "needs_you" = "working") =>
    publishStatus(f.db, agent.identity, {
      userAgentId: agent.agentId,
      state,
      queuedCount: 0,
      liveConversationId: shared.id,
      liveThreadId: root.id,
      activity: "Reading the secret launch notes",
      version,
    });
  await publish(1);
  expect((await listStatus(f.db, owner))[0]).toMatchObject({
    liveConversationId: shared.id,
    liveThreadId: root.id,
    activity: "Reading the secret launch notes",
  });

  await alice.leaveConversation(shared.id);
  const hidden = { liveConversationId: null, liveThreadId: null, activity: null };
  expect((await listStatus(f.db, owner))[0]).toMatchObject(hidden);
  // A later publish for the hidden place stores neither the place nor the activity.
  await publish(2, "needs_you");
  const [row] = await f.db.select().from(agentStatus);
  expect(row).toMatchObject(hidden);
  const needsYou = await listNeedsYou(f.db, owner);
  expect(needsYou.agents[0]).toMatchObject(hidden);
  const text = JSON.stringify([await listStatus(f.db, owner), needsYou]);
  for (const secret of ["secret", shared.id, root.id]) expect(text).not.toContain(secret);
});

test("millisecond status versions from the desktop clock are stored, and older ones change nothing", async () => {
  const { agent, owner } = await agentWorkFixture(f);
  const publish = (version: number, state: "working" | "idle") =>
    publishStatus(f.db, agent.identity, {
      userAgentId: agent.agentId,
      state,
      queuedCount: 0,
      version,
    });
  const now = Date.UTC(2026, 10, 9);
  await publish(now, "working");
  await publish(now - 1, "idle");
  expect((await listStatus(f.db, owner))[0]).toMatchObject({ state: "working" });
  await publish(now + 1, "idle");
  expect((await listStatus(f.db, owner))[0]).toMatchObject({ state: "idle" });
});

test("a publish reports a change only when what the owner sees changed", async () => {
  const { agent, alice } = await agentWorkFixture(f);
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  let version = 0;
  const publish = (input: { state?: "working" | "idle"; activity?: string }) =>
    publishStatus(f.db, agent.identity, {
      userAgentId: agent.agentId,
      state: input.state ?? "working",
      queuedCount: 0,
      liveConversationId: channel.id,
      activity: input.activity,
      version: ++version,
    });
  expect(await publish({ activity: "Reading" })).toEqual({ applied: true, changed: true });
  expect(await publish({ activity: "Reading" })).toEqual({ applied: true, changed: false });
  expect(await publish({ activity: "Drafting" })).toEqual({ applied: true, changed: true });
  expect(await publish({ state: "idle", activity: "Drafting" })).toEqual({
    applied: true,
    changed: true,
  });
  version = 0;
  expect(await publish({ state: "working" })).toEqual({ applied: false, changed: false });
});

test("status without a place keeps its activity, and a thread outside the conversation is dropped", async () => {
  const { agent, alice, owner, root } = await sharedThread();
  await publishStatus(f.db, agent.identity, {
    userAgentId: agent.agentId,
    state: "working",
    queuedCount: 1,
    activity: "Running the weekly routine",
    version: 1,
  });
  expect((await listStatus(f.db, owner))[0]?.activity).toBe("Running the weekly routine");

  // The root belongs to another conversation, so it is not this conversation's thread.
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  await publishStatus(f.db, agent.identity, {
    userAgentId: agent.agentId,
    state: "working",
    queuedCount: 0,
    liveConversationId: channel.id,
    liveThreadId: root.id,
    activity: "Drafting",
    version: 2,
  });
  expect((await listStatus(f.db, owner))[0]).toMatchObject({
    liveConversationId: channel.id,
    liveThreadId: null,
    activity: "Drafting",
  });
});
