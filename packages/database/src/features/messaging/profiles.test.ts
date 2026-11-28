import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { AccessDeniedError } from "../../errors";
import { user, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { createMessagingService } from "./service";
import { expect, test } from "bun:test";

const f = setupDatabase();

const chat = f.messaging;

test("person profiles show contact details only to workspace members who share the conversation", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const general = await chat("alice").createConversation({ kind: "channel", name: "general" });
  const hidden = await chat("alice").createConversation({
    kind: "channel",
    name: "hidden",
    private: true,
  });
  const dm = await chat("alice").createConversation({ kind: "dm", emails: ["bob@example.com"] });

  expect(await chat("alice").getProfile(general.id, f.bob)).toEqual({
    id: f.bob,
    type: "human",
    name: "Bob",
    self: false,
    external: false,
    email: "bob@example.com",
    image: null,
    avatar: null,
    role: "member",
    directConversationId: dm.id,
    agent: null,
  });
  expect(await chat("bob").getProfile(general.id, f.bob)).toMatchObject({
    self: true,
    directConversationId: null,
  });
  const recording = recordQueries();
  await createMessagingService(recording.db, {
    userId: "alice",
    organizationId: f.orgA,
  }).getProfile(general.id, f.bob);
  expect(recording.queries.filter((query) => query.startsWith("select"))).toHaveLength(4);
  const profileQuery = recording.queries.find((query) => query.includes('"person_user"'))!;
  expect(profileQuery).toContain('left join "user_agents"');
  expect(profileQuery).not.toMatch(/dn_user|dn_agent/);
  expect(await rejection(chat("bob").getProfile(hidden.id, f.alice))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(chat("alice").getProfile(hidden.id, f.bob))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(chat("alice").getProfile(general.id, f.outsider))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(chat("outsider", f.orgB).getProfile(general.id, f.alice))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("external authors keep their name without contact details", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const dm = await chat("alice").createConversation({
    kind: "dm",
    emails: ["outside@example.com"],
  });
  await chat("outsider", f.orgB).sendMessage(dm.id, "hello");
  expect(await chat("alice").getProfile(dm.id, f.outsider)).toEqual({
    id: f.outsider,
    type: "human",
    name: "Outsider",
    self: false,
    external: true,
    email: null,
    image: null,
    avatar: null,
    role: null,
    directConversationId: null,
    agent: null,
  });
});

test("agent profiles show the owner to members and configuration only to the owner", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const [definition] = await f.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Research",
      instructions: "",
      avatarCode: "100000",
      harness: "claude",
      model: "sonnet",
    })
    .returning();
  const agent = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: definition!.id,
  });
  const general = await chat("alice").createConversation({ kind: "channel", name: "general" });
  expect((await chat("alice").getProfile(general.id, agent.entityId)).type).toBe("agent");
  expect(await rejection(chat("bob").getProfile(general.id, agent.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await chat("alice", f.orgA, agent.entityId).sendMessage(general.id, "agent work");

  expect((await chat("alice").getProfile(general.id, agent.entityId)).agent).toEqual({
    ownerName: "Alice",
    harness: "claude",
    model: "sonnet",
  });
  expect(await chat("bob").getProfile(general.id, agent.entityId)).toMatchObject({
    type: "agent",
    name: "Research",
    email: null,
    image: null,
    avatar: "100000",
    agent: { ownerName: "Alice", harness: null, model: null },
  });
});

test("agent profiles resolve for members while the agent is a live member, before it writes", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const [definition] = await f.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Research",
      instructions: "",
      avatarCode: "100000",
      harness: "claude",
    })
    .returning();
  const general = await chat("alice").createConversation({ kind: "channel", name: "general" });
  const { actorId } = await chat("alice").addAgent(general.id, definition!.id);
  expect(await chat("bob").getProfile(general.id, actorId)).toMatchObject({
    type: "agent",
    name: "Research",
  });
  await chat("alice").removeAgent(general.id, actorId);
  expect(await rejection(chat("bob").getProfile(general.id, actorId))).toBeInstanceOf(
    AccessDeniedError,
  );
});
