/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { setupDatabase } from "../../testing/database";
import { emailConversations } from "./conversations.schema";
import { emailMessages } from "./messages.schema";
import { emailParticipants } from "./participants.schema";
import { emailIntegrations } from "./integrations.schema";

const f = setupDatabase();

test("messages, conversations, and access parents must agree on the mailbox", async () => {
  const repo = f.forActor(f.alice);
  const a = await repo.emailAccounts.create({ displayName: "A", emailAddress: "a@example.com" });
  const b = await repo.emailAccounts.create({ displayName: "B", emailAddress: "b@example.com" });
  const conversation = await repo.emailConversations.create({
    emailAccountEntityId: a.entityId,
    subject: "A",
  });
  const message = await repo.emailMessages.create({
    conversationEntityId: conversation.entityId,
    direction: "inbound",
  });
  await expect(
    f.db
      .update(emailMessages)
      .set({ emailAccountEntityId: b.entityId })
      .where(eq(emailMessages.entityId, message.entityId))
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    f.db
      .update(emailConversations)
      .set({ emailAccountEntityId: b.entityId })
      .where(eq(emailConversations.entityId, conversation.entityId))
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  const contact = await f
    .forActor(f.outsider, f.orgB)
    .contacts.create({ displayName: "Other organization" });
  await expect(
    f.db
      .insert(emailParticipants)
      .values({
        organizationId: f.orgA,
        emailMessageEntityId: message.entityId,
        kind: "to",
        address: "other@example.com",
        contactEntityId: contact.entityId,
      })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    f.db
      .insert(emailIntegrations)
      .values({
        organizationId: f.orgA,
        emailAccountEntityId: a.entityId,
        provider: "google",
        externalAccountId: "a",
        externalResourceId: "a",
        credentialReference: "vault/a",
        connectedByActorEntityId: f.outsider,
      })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

test("provider message IDs are unique per mailbox, not globally", async () => {
  const repo = f.forActor(f.alice);
  const a = await repo.emailAccounts.create({ displayName: "A", emailAddress: "a@example.com" });
  const b = await repo.emailAccounts.create({ displayName: "B", emailAddress: "b@example.com" });
  const conversationA = await repo.emailConversations.create({
    emailAccountEntityId: a.entityId,
    subject: "A",
    providerConversationId: "conversation-1",
  });
  const conversationB = await repo.emailConversations.create({
    emailAccountEntityId: b.entityId,
    subject: "B",
    providerConversationId: "conversation-1",
  });
  await repo.emailMessages.create({
    conversationEntityId: conversationA.entityId,
    direction: "inbound",
    providerMessageId: "message-1",
  });
  await repo.emailMessages.create({
    conversationEntityId: conversationB.entityId,
    direction: "inbound",
    providerMessageId: "message-1",
  });
  await expect(
    repo.emailMessages.create({
      conversationEntityId: conversationA.entityId,
      direction: "inbound",
      providerMessageId: "message-1",
    }),
  ).rejects.toMatchObject({ cause: { code: "23505" } });
  expect(await repo.emailMessages.list(conversationA.entityId)).toHaveLength(1);
  expect(await repo.emailMessages.list(conversationB.entityId)).toHaveLength(1);
});
