import { contextConversation } from "../../../testing/context";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../../messaging/schema";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

async function publishedInteraction() {
  const source = await contextConversation(f);
  const contact = await source.repos.contacts.create({ displayName: "Customer" });
  const alice = await f.forSession("alice");
  const published = await alice.contactInteractions.publishInteraction({
    contactEntityId: contact.entityId,
    kind: "message",
    summary: "Approved summary",
    occurredAt: "2026-11-12T12:00:00.000Z",
    messageId: source.reply.id,
    consentToContactAudience: true,
  });
  return { ...source, alice, entityId: published.result.entityId };
}

test("interaction detail exposes only readable source IDs without granting source access", async () => {
  const { alice, conversation, reply, entityId } = await publishedInteraction();
  expect((await alice.contactInteractions.workspaceRecord(entityId)).source).toEqual({
    conversationId: conversation.id,
    messageId: reply.id,
  });
  const bob = await f.forSession("bob");
  expect(await bob.contactInteractions.workspaceRecord(entityId)).toMatchObject({
    interaction: { summary: "Approved summary" },
    source: null,
  });
  expect(await rejection(f.messaging("bob").listMessages(conversation.id))).toMatchObject({
    name: "AccessDeniedError",
  });
  const outsider = await f.forSession("outsider", f.orgB);
  expect(await rejection(outsider.contactInteractions.workspaceRecord(entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
});

test("revoked source access redacts IDs even for an organization owner without hiding the summary", async () => {
  const { alice, conversation, entityId } = await publishedInteraction();
  await f.db
    .update(messagingParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(messagingParticipants.conversationId, conversation.id),
        eq(messagingParticipants.actorEntityId, f.alice),
      ),
    );
  const detail = await alice.contactInteractions.workspaceRecord(entityId);
  expect(detail.source).toBeNull();
  expect(detail.interaction.summary).toBe("Approved summary");
});

test("actor-only reads do not expose source IDs without a messaging identity", async () => {
  const { entityId } = await publishedInteraction();
  const detail = await f.forActor(f.alice).contactInteractions.workspaceRecord(entityId);
  expect(detail.source).toBeNull();
  expect(detail.interaction.summary).toBe("Approved summary");
});

test.each(["soft message", "hard message", "conversation"])(
  "deleted source (%s) leaves the published summary readable with no source IDs",
  async (deletion) => {
    const { alice, conversation, reply, entityId } = await publishedInteraction();
    if (deletion === "soft message")
      await f.db
        .update(messagingMessages)
        .set({ deletedAt: new Date(), body: "" })
        .where(eq(messagingMessages.id, reply.id));
    else if (deletion === "hard message")
      await f.db.delete(messagingMessages).where(eq(messagingMessages.id, reply.id));
    else
      await f.db
        .delete(messagingConversations)
        .where(eq(messagingConversations.id, conversation.id));
    const detail = await alice.contactInteractions.workspaceRecord(entityId);
    expect(detail.source).toBeNull();
    expect(detail.interaction.summary).toBe("Approved summary");
  },
);

test("manual interactions have no source", async () => {
  await f.verifyEmails();
  const alice = await f.forSession("alice");
  const contact = await f.forActor(f.alice).contacts.create({ displayName: "Customer" });
  const interaction = await alice.contactInteractions.createManual({
    contactEntityId: contact.entityId,
    kind: "note",
    summary: "Manual note",
    occurredAt: new Date(),
  });
  expect(
    (await alice.contactInteractions.workspaceRecord(interaction.result.entityId)).source,
  ).toBeNull();
});
