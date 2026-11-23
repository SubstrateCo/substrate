import { ensureHumanActor } from "../../core/actors/provisioning";
import { AccessDeniedError } from "../../errors";
import { member } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { messagingParticipants } from "./schema";
import { createMessagingService } from "./service";
import { messagingConnections } from "./sharing.schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const unread = (conversationId: string, firstUnreadMessageId: string, mentionCount = 0) => ({
  conversationId,
  unreadCount: 1,
  mentionCount,
  firstUnreadMessageId,
});

test("external unread counts require individual consent and an active organization connection", async () => {
  await f.verifyEmails();
  const conversation = await f.messaging("alice").createConversation({
    kind: "dm",
    emails: ["outside@example.com"],
  });
  const shared = await f.messaging("alice").sendMessage(conversation.id, "shared");
  const reader = f.messaging("outsider", f.orgB);
  const expected = [unread(conversation.id, shared.id)];
  expect(await reader.unreadCounts()).toEqual(expected);
  await f.db
    .update(messagingParticipants)
    .set({ consentedAt: null })
    .where(eq(messagingParticipants.actorEntityId, f.outsider));
  expect(await reader.unreadCounts()).toEqual([]);
  await f.db
    .update(messagingParticipants)
    .set({ consentedAt: new Date() })
    .where(eq(messagingParticipants.actorEntityId, f.outsider));
  expect(await reader.unreadCounts()).toEqual(expected);
  await f.db.update(messagingConnections).set({ disconnectedAt: new Date() });
  expect(await reader.unreadCounts()).toEqual([]);
});

test("admins do not receive private unread counts without live participation", async () => {
  await f.verifyEmails();
  await f.db.update(member).set({ role: "admin" }).where(eq(member.userId, "bob"));
  const alice = f.messaging("alice");
  const conversation = await alice.createConversation({
    kind: "channel",
    name: "private",
    private: true,
  });
  const secret = await alice.sendMessage(conversation.id, "secret");
  expect(await f.messaging("bob").unreadCounts()).toEqual([]);
  await alice.addMembers(conversation.id, ["bob@example.com"]);
  expect(await f.messaging("bob").unreadCounts()).toEqual([unread(conversation.id, secret.id)]);
  await alice.removeMember(conversation.id, f.bob);
  expect(await f.messaging("bob").unreadCounts()).toEqual([]);
});

test("agent scopes cannot read human unread counts", async () => {
  const agent = await ownedAgent(f);
  const reader = createMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    actorEntityId: agent.actorId,
  });
  expect(await rejection(reader.unreadCounts())).toBeInstanceOf(AccessDeniedError);
  const conversation = await f.messaging("alice").createConversation({
    kind: "dm",
    emails: ["bob@example.com"],
  });
  const update = await reader.sendMessage(conversation.id, "agent update");
  expect(await f.messaging("bob").unreadCounts()).toEqual([unread(conversation.id, update.id)]);
});

test("unread counts exclude the person's authorship from another organization", async () => {
  await f.verifyEmails();
  await f.db
    .insert(member)
    .values({ id: "bob-b", userId: "bob", organizationId: f.orgB, role: "member" });
  const partnerActor = await ensureHumanActor(f.db, { userId: "bob", organizationId: f.orgB });
  const conversation = await f.messaging("alice").createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
  });
  await f.db.insert(messagingParticipants).values({
    conversationId: conversation.id,
    organizationId: f.orgB,
    actorEntityId: partnerActor.entityId,
    actorType: "human",
    consentedAt: new Date(),
  });
  await f.messaging("bob", f.orgB).sendMessage(conversation.id, "own other workspace");
  const other = await f.messaging("alice").sendMessage(conversation.id, "someone else");
  expect(await f.messaging("bob").unreadCounts()).toEqual([unread(conversation.id, other.id)]);
});

test("mention counts need the same live access as unread counts", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const conversation = await alice.createConversation({
    kind: "channel",
    name: "private",
    private: true,
    emails: ["bob@example.com"],
  });
  const mention = await alice.sendMessage(conversation.id, `@[person:${f.bob}] secret`);
  expect(await f.messaging("bob").unreadCounts()).toEqual([unread(conversation.id, mention.id, 1)]);
  await alice.removeMember(conversation.id, f.bob);
  expect(await f.messaging("bob").unreadCounts()).toEqual([]);
});

test("partner readers count only their own mentions in a shared conversation", async () => {
  await f.verifyEmails();
  const conversation = await f.messaging("alice").createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
  });
  const mention = await f.messaging("alice").sendMessage(conversation.id, `@[person:${f.bob}] hi`);
  expect(await f.messaging("outsider", f.orgB).unreadCounts()).toEqual([
    unread(conversation.id, mention.id),
  ]);
  expect(await f.messaging("bob").unreadCounts()).toEqual([unread(conversation.id, mention.id, 1)]);
});
