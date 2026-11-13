import { contactInteractions } from "../../core/contacts/interactions.schema";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { messagingMessages } from "../messaging/schema";
import { messageEntityReferences } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
test("publication is consented, idempotent, contact-visible, and cannot revive a deletion", async () => {
  const { repos, reply } = await contextConversation(f);
  const contact = await repos.contacts.create({ displayName: "Customer" });
  await repos.permissions.grant({
    entityId: contact.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const alice = await f.forSession("alice");
  const input = {
    contactEntityId: contact.entityId,
    kind: "message" as const,
    summary: "Approved summary",
    occurredAt: "2026-11-12T12:00:00.000Z",
    messageId: reply.id,
    consentToContactAudience: true as const,
  };
  const [first, second] = await Promise.all([
    alice.contactInteractions.publishInteraction(input),
    alice.contactInteractions.publishInteraction(input),
  ]);
  expect(first.result.entityId).toBe(second.result.entityId);
  expect(await f.db.select().from(contactInteractions)).toHaveLength(1);
  expect(
    await f.db
      .select({ purpose: messageEntityReferences.purpose })
      .from(messageEntityReferences)
      .where(eq(messageEntityReferences.entityId, first.result.entityId)),
  ).toEqual([{ purpose: "source" }]);
  const visible = await f.forActor(f.bob).contactInteractions.get(first.result.entityId);
  expect(visible.summary).toBe("Approved summary");
  expect(visible).not.toHaveProperty("messageId");
  await repos.contactInteractions.update(first.result.entityId, { summary: "Later correction" });
  // A repeat, even with a different summary, returns the published interaction unchanged.
  const replay = await alice.contactInteractions.publishInteraction({
    ...input,
    summary: "Changed replay",
  });
  expect(replay.result).toMatchObject({
    entityId: first.result.entityId,
    summary: "Later correction",
  });
  await repos.contactInteractions.softDelete(first.result.entityId);
  expect(await rejection(alice.contactInteractions.publishInteraction(input))).toMatchObject({
    name: "AccessDeniedError",
  });
  await f.db.delete(messagingMessages).where(eq(messagingMessages.id, reply.id));
  expect(await rejection(alice.contactInteractions.publishInteraction(input))).toMatchObject({
    name: "AccessDeniedError",
  });
});

test("publication rejects a contact-only reader and false audience consent", async () => {
  const { repos, reply } = await contextConversation(f);
  const contact = await repos.contacts.create({ displayName: "Customer" });
  await repos.permissions.grant({
    entityId: contact.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  const bob = await f.forSession("bob");
  const input = {
    contactEntityId: contact.entityId,
    kind: "message" as const,
    summary: "Approved",
    occurredAt: "2026-11-12T12:00:00.000Z",
    messageId: reply.id,
    consentToContactAudience: true as const,
  };
  expect(await rejection(bob.contactInteractions.publishInteraction(input))).toMatchObject({
    name: "AccessDeniedError",
  });
  const alice = await f.forSession("alice");
  // SAFETY: deliberately bypass the literal consent type to test the untrusted runtime boundary.
  expect(
    await rejection(
      alice.contactInteractions.publishInteraction({
        ...input,
        consentToContactAudience: false as never,
      }),
    ),
  ).toMatchObject({ name: "ValidationError" });
  expect(await f.db.select().from(contactInteractions)).toEqual([]);
});
