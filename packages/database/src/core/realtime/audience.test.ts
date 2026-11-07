import { realtimeKeys } from "@startup-os/contracts/realtime";

import {
  actors,
  entities,
  member,
  messagingConversations,
  messagingParticipants,
  user,
} from "../../schema";
import { setupDatabase } from "../../testing/database";
import { ensureHumanActor } from "../actors/provisioning";
import { canReceiveChange } from "./audience";
import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();
beforeEach(async () => {
  await fixture.db.update(user).set({ emailVerified: true });
});
const alice = { userId: "alice", organizationId: "org-a" };
const bob = { userId: "bob", organizationId: "org-a" };
const external = { userId: "outsider", organizationId: "org-b" };

test("private and public external channels require a participant in the viewer workspace", async () => {
  for (const privateChannel of [true, false]) {
    const [conversation] = await fixture.db
      .insert(messagingConversations)
      .values({
        organizationId: fixture.orgA,
        kind: "channel",
        private: privateChannel,
        name: "Partner",
        createdBy: "alice",
      })
      .returning();
    if (!conversation) throw new Error("Missing conversation");
    await fixture.db.insert(messagingParticipants).values([
      { conversationId: conversation.id, userId: "alice", organizationId: fixture.orgA },
      { conversationId: conversation.id, userId: "outsider", organizationId: fixture.orgB },
    ]);
    const audience = realtimeKeys.conversation(conversation.id);
    expect(await canReceiveChange(fixture.db, external, audience)).toBe(true);
    expect(await canReceiveChange(fixture.db, alice, audience)).toBe(true);
    expect(await canReceiveChange(fixture.db, bob, audience)).toBe(!privateChannel);
    expect(
      await canReceiveChange(fixture.db, { ...external, organizationId: fixture.orgA }, audience),
    ).toBe(false);
    await fixture.db
      .update(messagingParticipants)
      .set({ organizationId: fixture.orgA })
      .where(eq(messagingParticipants.userId, "outsider"));
    expect(await canReceiveChange(fixture.db, external, audience)).toBe(false);
  }
});

test("actor notifications, organization and user audiences do not cross identity or workspace", async () => {
  const audience = realtimeKeys.actor(fixture.orgA, fixture.alice);
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(true);
  expect(await canReceiveChange(fixture.db, bob, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, external, audience)).toBe(false);
  expect(
    await canReceiveChange(fixture.db, alice, realtimeKeys.actor(fixture.orgB, fixture.alice)),
  ).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, realtimeKeys.organization(fixture.orgB))).toBe(
    false,
  );
  expect(
    await canReceiveChange(
      fixture.db,
      { ...alice, organizationId: null },
      realtimeKeys.user("alice"),
    ),
  ).toBe(true);
  expect(await canReceiveChange(fixture.db, bob, realtimeKeys.user("alice"))).toBe(false);
});

test("a partner with membership in both organizations receives private channel events only in its participant workspace", async () => {
  await fixture.db.insert(member).values({
    id: "outsider-a",
    userId: "outsider",
    organizationId: fixture.orgA,
  });
  await ensureHumanActor(fixture.db, {
    userId: "outsider",
    organizationId: fixture.orgA,
    name: "Partner in A",
  });
  const [conversation] = await fixture.db
    .insert(messagingConversations)
    .values({
      organizationId: fixture.orgA,
      kind: "channel",
      private: true,
      name: "Partner workspace boundary",
      createdBy: "alice",
    })
    .returning();
  if (!conversation) throw new Error("Missing conversation");
  await fixture.db.insert(messagingParticipants).values([
    { conversationId: conversation.id, userId: "alice", organizationId: fixture.orgA },
    { conversationId: conversation.id, userId: "outsider", organizationId: fixture.orgB },
  ]);
  const audience = realtimeKeys.conversation(conversation.id);
  expect(await canReceiveChange(fixture.db, external, audience)).toBe(true);
  expect(
    await canReceiveChange(fixture.db, { ...external, organizationId: fixture.orgA }, audience),
  ).toBe(false);
});

test("disabled, deleted, revoked and unverified viewers lose scoped delivery", async () => {
  const audience = realtimeKeys.organization(fixture.orgA);
  const notificationAudience = realtimeKeys.actor(fixture.orgA, fixture.alice);
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(true);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(true);
  await fixture.db
    .update(actors)
    .set({ disabledAt: new Date() })
    .where(eq(actors.entityId, fixture.alice));
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(false);
  await fixture.db
    .update(actors)
    .set({ disabledAt: null })
    .where(eq(actors.entityId, fixture.alice));
  await fixture.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, fixture.alice));
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(false);
  await fixture.db
    .update(entities)
    .set({ deletedAt: null })
    .where(eq(entities.entityId, fixture.alice));
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "alice"));
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(false);
  await fixture.db.update(user).set({ emailVerified: true }).where(eq(user.id, "alice"));
  await fixture.db.delete(member).where(eq(member.id, "alice-a"));
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(false);
});
