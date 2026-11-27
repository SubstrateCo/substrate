import { AccessDeniedError, ValidationError } from "../../../errors";
import { member, messagingConversations } from "../../../schema";
import { ownedAgent } from "../../../testing/agents";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { createMessagingService } from "../service";
import { directMessageKey } from "./direct-messages";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("an agent DM fixes one owner and one owned agent, and reuses the pair", async () => {
  const agent = await ownedAgent(f);
  const alice = f.messaging("alice");
  const input = { kind: "agent_dm" as const, agentIds: [agent.agentId], private: false };
  const [first, concurrent] = await Promise.all([
    alice.createConversation(input),
    alice.createConversation(input),
  ]);
  expect(first).toMatchObject({ kind: "agent_dm", private: true });
  expect(concurrent.id).toBe(first.id);
  expect((await alice.createConversation(input)).id).toBe(first.id);
  const [listed] = await alice.listConversations();
  expect(listed).toMatchObject({ id: first.id, canManage: false, canShare: false });
  expect(listed!.members.map(({ type }) => type).sort()).toEqual(["agent", "human"]);
});

test("agent DM creation rejects humans, missing or extra agents, and unowned agents", async () => {
  const agent = await ownedAgent(f);
  const second = await ownedAgent(f, "alice", "Second");
  const other = await ownedAgent(f, "bob");
  const alice = f.messaging("alice");
  for (const input of [
    { agentIds: [] },
    { agentIds: [agent.agentId, second.agentId] },
    { agentIds: [agent.agentId], emails: ["bob@example.com"] },
    { agentIds: [agent.agentId], emails: ["alice@example.com"] },
    { agentIds: [agent.agentId], emails: ["outside@example.com"], shareHistory: true },
  ]) {
    expect(
      await rejection(alice.createConversation({ kind: "agent_dm", ...input })),
    ).toBeInstanceOf(ValidationError);
  }
  expect(
    await rejection(alice.createConversation({ kind: "agent_dm", agentIds: [other.agentId] })),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(alice.createConversation({ kind: "dm", agentIds: [agent.agentId] })),
  ).toBeInstanceOf(ValidationError);
  expect(await alice.listConversations()).toEqual([]);
});

test("starting an agent DM leaves a pre-existing ordinary DM unchanged", async () => {
  const agent = await ownedAgent(f);
  const alice = f.messaging("alice");
  const input = { kind: "agent_dm" as const, agentIds: [agent.agentId] };
  const existing = await alice.createConversation(input);
  await alice.sendMessage(existing.id, "Existing history");
  // The old system stored an owner-agent pair as an ordinary DM.
  await f.db
    .update(messagingConversations)
    .set({
      kind: "dm",
      dmKey: directMessageKey(f.orgA, [f.alice, agent.actorId]),
    })
    .where(eq(messagingConversations.id, existing.id));
  const created = await alice.createConversation(input);
  expect(created.id).not.toBe(existing.id);
  expect((await alice.listConversations()).map(({ id, kind }) => ({ id, kind }))).toEqual(
    expect.arrayContaining([
      { id: existing.id, kind: "dm" },
      { id: created.id, kind: "agent_dm" },
    ]),
  );
  expect((await alice.listMessages(existing.id)).map(({ body }) => body)).toEqual([
    "Existing history",
  ]);
});

test("agent DMs deny all membership and sharing changes", async () => {
  const agent = await ownedAgent(f);
  const second = await ownedAgent(f, "alice", "Second");
  const alice = f.messaging("alice");
  const dm = await alice.createConversation({ kind: "agent_dm", agentIds: [agent.agentId] });
  for (const action of [
    () => alice.addMembers(dm.id, ["bob@example.com"]),
    () => alice.addMembers(dm.id, ["outside@example.com"]),
    () => alice.addAgent(dm.id, second.agentId),
    () => alice.removeAgent(dm.id, agent.actorId),
    () => alice.removeMember(dm.id, f.alice),
    () => alice.joinConversation(dm.id),
    () => alice.leaveConversation(dm.id, "bob"),
    () => alice.transferOwnership(dm.id, "bob"),
    () => alice.deleteConversation(dm.id),
  ]) {
    expect(await rejection(action())).toBeInstanceOf(AccessDeniedError);
  }
  expect((await alice.listConversations())[0]!.members).toHaveLength(2);
});

test("only the owner and the paired agent can read or post, not admins or sibling agents", async () => {
  const agent = await ownedAgent(f);
  const sibling = await ownedAgent(f, "alice", "Sibling");
  await f.db.update(member).set({ role: "admin" }).where(eq(member.userId, "bob"));
  const alice = f.messaging("alice");
  const dm = await alice.createConversation({ kind: "agent_dm", agentIds: [agent.agentId] });
  const paired = createMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    actorEntityId: agent.actorId,
  });
  const otherAgent = createMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    actorEntityId: sibling.actorId,
  });
  await alice.sendMessage(dm.id, "Private request");
  await paired.sendMessage(dm.id, "Private answer");
  expect((await paired.listMessages(dm.id)).map(({ body }) => body)).toEqual([
    "Private request",
    "Private answer",
  ]);
  for (const reader of [f.messaging("bob"), f.messaging("outsider", f.orgB), otherAgent]) {
    expect((await reader.listConversations()).map(({ id }) => id)).not.toContain(dm.id);
    expect(await rejection(reader.listMessages(dm.id))).toBeInstanceOf(AccessDeniedError);
    expect(await rejection(reader.sendMessage(dm.id, "Not allowed"))).toBeInstanceOf(
      AccessDeniedError,
    );
  }
  expect((await f.messaging("bob").listManagedConversations()).map(({ id }) => id)).not.toContain(
    dm.id,
  );
});
