/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

test("mailbox access flows to conversations and messages, including generic entity reads", async () => {
  const owner = f.forActor(f.alice);
  const account = await owner.emailAccounts.create({
    displayName: "Work",
    emailAddress: "alice@example.com",
  });
  const conversation = await owner.emailConversations.create({
    emailAccountEntityId: account.entityId,
    subject: "Hello",
  });
  const message = await owner.emailMessages.create({
    conversationEntityId: conversation.entityId,
    subject: "Hello",
    textBody: "Welcome",
    direction: "inbound",
  });
  await expect(f.forActor(f.bob).emailMessages.get(message.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await owner.permissions.grant({
    entityId: account.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect((await f.forActor(f.bob).entities.get(message.entityId)).entityType).toBe("email_message");
  expect(await f.forActor(f.bob).emailMessages.list(conversation.entityId)).toHaveLength(1);
  await expect(
    f
      .forActor(f.bob)
      .emailMessages.create({
        conversationEntityId: conversation.entityId,
        subject: "No",
        direction: "draft",
      }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await owner.permissions.revoke({ entityId: account.entityId, actorEntityId: f.bob });
  await expect(f.forActor(f.bob).entities.get(message.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("email creation rejects cross-organization accounts and rolls back atomically", async () => {
  const owner = f.forActor(f.alice);
  const account = await owner.emailAccounts.create({
    displayName: "Work",
    emailAddress: "alice@example.com",
  });
  await expect(
    f
      .forActor(f.outsider, f.orgB)
      .emailConversations.create({ emailAccountEntityId: account.entityId, subject: "No" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    owner.transaction(async (tx) => {
      const conversation = await tx.emailConversations.create({
        emailAccountEntityId: account.entityId,
        subject: "Rollback",
      });
      await tx.emailMessages.create({
        conversationEntityId: conversation.entityId,
        subject: "Rollback",
        direction: "draft",
      });
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect(await owner.emailConversations.list(account.entityId)).toEqual([]);
});

test("participants preserve address snapshots without exposing private contact references", async () => {
  const owner = f.forActor(f.alice);
  const account = await owner.emailAccounts.create({
    displayName: "Work",
    emailAddress: "alice@example.com",
  });
  const conversation = await owner.emailConversations.create({
    emailAccountEntityId: account.entityId,
    subject: "Hello",
  });
  const message = await owner.emailMessages.create({
    conversationEntityId: conversation.entityId,
    subject: "Hello",
    direction: "inbound",
  });
  const contact = await owner.contacts.create({ displayName: "Private CRM contact" });
  await owner.emailMessages.addParticipant(message.entityId, {
    kind: "from",
    address: " CUSTOMER@EXAMPLE.COM ",
    displayName: "Customer",
    contactEntityId: contact.entityId,
  });
  await owner.permissions.grant({
    entityId: account.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const participants = await f.forActor(f.bob).emailMessages.listParticipants(message.entityId);
  expect(participants[0]?.address).toBe("customer@example.com");
  expect(participants[0]?.displayName).toBe("Customer");
  expect(participants[0]?.contactEntityId).toBeNull();
  expect((await owner.emailMessages.listParticipants(message.entityId))[0]?.contactEntityId).toBe(
    contact.entityId,
  );
  await expect(
    f
      .forActor(f.bob)
      .emailMessages.removeParticipant(message.entityId, {
        kind: "from",
        address: "customer@example.com",
      }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await owner.emailMessages.removeParticipant(message.entityId, {
    kind: "from",
    address: " CUSTOMER@EXAMPLE.COM ",
  });
  expect(await owner.emailMessages.listParticipants(message.entityId)).toEqual([]);
  expect(
    (await owner.emailMessages.update(message.entityId, { textBody: "Updated content" })).textBody,
  ).toBe("Updated content");
});
