import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { user, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const service = (userId: string, organizationId = f.orgA) =>
  createAcceptedMessagingService(f.db, { userId, organizationId });

test("renamed human authors agree across send, read, and replay for roots and replies", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const channel = await service("alice").createConversation({
    kind: "channel",
    name: "partners",
    emails: ["outside@example.com"],
  });
  for (const [userId, organizationId, name] of [
    ["alice", f.orgA, "Alice renamed"],
    ["outsider", f.orgB, "Partner renamed"],
  ] as const) {
    const chat = service(userId, organizationId);
    const rootRequest = crypto.randomUUID();
    const replyRequest = crypto.randomUUID();
    const root = await chat.sendMessage(channel.id, "root", undefined, rootRequest);
    const reply = await chat.sendMessage(channel.id, "reply", root.id, replyRequest);
    await f.db.update(user).set({ name }).where(eq(user.id, userId));
    const attribution = { authorName: name, authorType: "human" };
    expect(await chat.sendMessage(channel.id, "root", undefined, rootRequest)).toMatchObject({
      id: root.id,
      ...attribution,
    });
    expect(await chat.sendMessage(channel.id, "reply", root.id, replyRequest)).toMatchObject({
      id: reply.id,
      ...attribution,
    });
    const newRoot = await chat.sendMessage(channel.id, "new root");
    const newReply = await chat.sendMessage(channel.id, "new reply", root.id);
    expect(newRoot).toMatchObject(attribution);
    expect(newReply).toMatchObject(attribution);
    for (const [viewer, viewerOrganization] of [
      ["alice", f.orgA],
      ["outsider", f.orgB],
    ] as const) {
      const reader = service(viewer, viewerOrganization);
      const expected = { ...attribution, authorExternal: organizationId !== viewerOrganization };
      expect(await reader.listMessages(channel.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: root.id, ...expected }),
          expect.objectContaining({ id: newRoot.id, ...expected }),
        ]),
      );
      expect(await reader.listMessages(channel.id, root.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: reply.id, ...expected }),
          expect.objectContaining({ id: newReply.id, ...expected }),
        ]),
      );
    }
  }
});

test("agent messages show the agent's current name, not its owner's", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId: "alice", name: "Research", instructions: "", harness: "opencode" })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  const human = service("alice");
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  await f.db.update(user).set({ name: "Alice renamed" }).where(eq(user.id, "alice"));
  const chat = createAcceptedMessagingService(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    actorEntityId: actor.entityId,
  });
  const attribution = { authorName: "Research", authorType: "agent", authorId: null };
  const root = await chat.sendMessage(channel.id, "root");
  expect(root).toMatchObject(attribution);
  const requestId = crypto.randomUUID();
  const reply = await chat.sendMessage(channel.id, "reply", root.id, requestId);
  expect(reply).toMatchObject(attribution);
  expect(await chat.sendMessage(channel.id, "reply", root.id, requestId)).toMatchObject({
    id: reply.id,
    ...attribution,
  });
  expect(await human.listMessages(channel.id)).toMatchObject([
    { id: root.id, ...attribution, authorExternal: false },
  ]);
  expect(await human.listMessages(channel.id, root.id)).toMatchObject([
    { id: reply.id, ...attribution, authorExternal: false },
  ]);
  await f.db.update(userAgents).set({ name: "Scout" }).where(eq(userAgents.id, agent!.id));
  expect(await human.listMessages(channel.id)).toMatchObject([
    { id: root.id, authorName: "Scout", authorType: "agent" },
  ]);
  expect(await chat.sendMessage(channel.id, "reply", root.id, requestId)).toMatchObject({
    id: reply.id,
    authorName: "Scout",
  });
});
