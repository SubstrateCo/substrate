import { realtimeKeys } from "@startup-os/contracts/realtime";

import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
  storedFiles,
  user,
  userPictures,
} from "../../schema";
import { setupDatabase } from "../../testing/database";
import { canReceiveChange } from "./audience";
import { readChanges } from "./repository";
import { realtimeOutbox } from "./schema";
import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();
const bob = { userId: "bob", organizationId: "org-a" };
const partner = { userId: "outsider", organizationId: "org-b" };
beforeEach(async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  await fixture.db.delete(realtimeOutbox);
});

test("public-to-private transitions reset a former public reader without exposing the private conversation", async () => {
  const [conversation] = await fixture.db
    .insert(messagingConversations)
    .values({
      organizationId: fixture.orgA,
      kind: "channel",
      private: false,
      name: "Hidden after flip",
      createdBy: "alice",
    })
    .returning();
  if (!conversation) throw new Error("Missing conversation");
  expect(await canReceiveChange(fixture.db, bob, realtimeKeys.conversation(conversation.id))).toBe(
    true,
  );
  await fixture.db.delete(realtimeOutbox);
  await fixture.db
    .update(messagingConversations)
    .set({ private: true })
    .where(eq(messagingConversations.id, conversation.id));
  expect(await canReceiveChange(fixture.db, bob, realtimeKeys.conversation(conversation.id))).toBe(
    false,
  );
  const resets = (await readChanges(fixture.db)).filter((change) => change.domain === "access");
  expect(resets.map((change) => change.audience)).toEqual([
    realtimeKeys.organization(fixture.orgA),
  ]);
  for (const reset of resets)
    expect(await canReceiveChange(fixture.db, bob, reset.audience)).toBe(true);
  const resetPayload = JSON.stringify(resets);
  expect(resetPayload).not.toContain(conversation.id);
  expect(resetPayload).not.toContain("Hidden");
});

test("conversation kind, owner workspace and deletion reset access, but names and messages do not", async () => {
  const [conversation] = await fixture.db
    .insert(messagingConversations)
    .values({
      organizationId: fixture.orgA,
      kind: "channel",
      private: true,
      name: "Private",
      createdBy: "alice",
    })
    .returning();
  if (!conversation) throw new Error("Missing conversation");
  await fixture.db
    .insert(messagingParticipants)
    .values({ conversationId: conversation.id, userId: "alice", organizationId: fixture.orgA });
  await fixture.db.delete(realtimeOutbox);
  await fixture.db
    .update(messagingConversations)
    .set({ name: "Renamed" })
    .where(eq(messagingConversations.id, conversation.id));
  await fixture.db.insert(messagingMessages).values({
    conversationId: conversation.id,
    authorId: "alice",
    body: "Body edit is not an access change",
  });
  expect((await readChanges(fixture.db)).filter((change) => change.domain === "access")).toEqual(
    [],
  );
  await fixture.db.delete(realtimeOutbox);
  await fixture.db
    .update(messagingConversations)
    .set({ kind: "group" })
    .where(eq(messagingConversations.id, conversation.id));
  expect(
    (await readChanges(fixture.db))
      .filter((change) => change.domain === "access")
      .map((change) => change.audience),
  ).toEqual([realtimeKeys.organization(fixture.orgA)]);
  await fixture.db.delete(realtimeOutbox);
  await fixture.db
    .update(messagingConversations)
    .set({ organizationId: fixture.orgB })
    .where(eq(messagingConversations.id, conversation.id));
  const moved = (await readChanges(fixture.db))
    .filter((change) => change.domain === "access")
    .map((change) => change.audience);
  expect(moved).toHaveLength(2);
  expect(moved).toContainEqual(realtimeKeys.organization(fixture.orgA));
  expect(moved).toContainEqual(realtimeKeys.organization(fixture.orgB));
  // A conversation without participants still needs an owner-workspace reset on deletion.
  const [empty] = await fixture.db
    .insert(messagingConversations)
    .values({
      organizationId: fixture.orgB,
      kind: "channel",
      private: false,
      name: "Empty",
      createdBy: "outsider",
    })
    .returning();
  if (!empty) throw new Error("Missing empty conversation");
  await fixture.db.delete(realtimeOutbox);
  await fixture.db.delete(messagingConversations).where(eq(messagingConversations.id, empty.id));
  expect(
    (await readChanges(fixture.db))
      .filter((change) => change.domain === "access")
      .map((change) => change.audience),
  ).toEqual([realtimeKeys.organization(fixture.orgB)]);
});

async function profileConversations() {
  const conversations = await fixture.db
    .insert(messagingConversations)
    .values([
      {
        organizationId: fixture.orgA,
        kind: "channel",
        private: true,
        name: "Secret shared channel",
        createdBy: "alice",
      },
      {
        organizationId: fixture.orgA,
        kind: "channel",
        private: false,
        name: "Shared public channel",
        createdBy: "alice",
      },
      { organizationId: fixture.orgA, kind: "dm", private: true, createdBy: "alice" },
      {
        organizationId: fixture.orgA,
        kind: "channel",
        private: true,
        name: "Secret unrelated channel",
        createdBy: "alice",
      },
    ])
    .returning();
  const [shared, publicChannel, dm, unrelated] = conversations;
  if (!shared || !publicChannel || !dm || !unrelated)
    throw new Error("Missing profile conversations");
  await fixture.db.insert(messagingParticipants).values([
    ...conversations.map((conversation) => ({
      conversationId: conversation.id,
      userId: "alice",
      organizationId: fixture.orgA,
    })),
    ...[shared, publicChannel, dm].map((conversation) => ({
      conversationId: conversation.id,
      userId: "outsider",
      organizationId: fixture.orgB,
    })),
    { conversationId: unrelated.id, userId: "bob", organizationId: fixture.orgA },
  ]);
  await fixture.db
    .insert(messagingMessages)
    .values({ conversationId: shared.id, authorId: "alice", body: "Secret author content" });
  await fixture.db.delete(realtimeOutbox);
  return { shared, publicChannel, dm, unrelated };
}

async function expectProfileRouting(
  conversations: Awaited<ReturnType<typeof profileConversations>>,
) {
  const changes = await readChanges(fixture.db);
  const profiles = changes.filter(
    (change) => change.domain === "profile" && change.audience[0] === "conversation",
  );
  // Native image writes also update user_pictures in the same transaction.
  const uniqueProfiles = [
    ...new Map(profiles.map((change) => [JSON.stringify(change.audience), change])).values(),
  ];
  expect(uniqueProfiles).toHaveLength(4);
  for (const conversation of Object.values(conversations)) {
    expect(profiles.map((change) => change.audience)).toContainEqual(
      realtimeKeys.conversation(conversation.id),
    );
  }
  const receivedByPartner = [];
  const receivedByBob = [];
  for (const change of uniqueProfiles) {
    if (await canReceiveChange(fixture.db, partner, change.audience))
      receivedByPartner.push(change.audience);
    if (await canReceiveChange(fixture.db, bob, change.audience))
      receivedByBob.push(change.audience);
  }
  expect(receivedByPartner).toHaveLength(3);
  expect(receivedByPartner).toContainEqual(realtimeKeys.conversation(conversations.shared.id));
  expect(receivedByPartner).toContainEqual(
    realtimeKeys.conversation(conversations.publicChannel.id),
  );
  expect(receivedByPartner).toContainEqual(realtimeKeys.conversation(conversations.dm.id));
  expect(receivedByPartner).not.toContainEqual(
    realtimeKeys.conversation(conversations.unrelated.id),
  );
  expect(receivedByBob).toHaveLength(2);
  expect(receivedByBob).toContainEqual(realtimeKeys.conversation(conversations.publicChannel.id));
  expect(receivedByBob).toContainEqual(realtimeKeys.conversation(conversations.unrelated.id));
  expect(changes.map((change) => change.audience)).not.toContainEqual(
    realtimeKeys.organization(fixture.orgB),
  );
  expect(JSON.stringify(changes)).not.toMatch(/Secret|New author name|object-key|sha256/);
}

test("actual user name and image changes reach only authorized shared-conversation readers", async () => {
  const conversations = await profileConversations();
  await fixture.db.update(user).set({ name: "New author name" }).where(eq(user.id, "alice"));
  await expectProfileRouting(conversations);
  await fixture.db.delete(realtimeOutbox);
  const fileId = crypto.randomUUID();
  await fixture.db.insert(storedFiles).values({
    id: fileId,
    ownerUserId: "alice",
    uploadedBy: "alice",
    purpose: "avatar",
    filename: "Secret.webp",
    contentType: "image/webp",
    size: 12,
    objectKey: `object-key/${fileId}`,
    sha256: "Secret-sha256",
  });
  await fixture.db
    .update(user)
    .set({ image: `/api/v1/files/${fileId}/content` })
    .where(eq(user.id, "alice"));
  await expectProfileRouting(conversations);
  expect(JSON.stringify(await readChanges(fixture.db))).not.toContain(fileId);
  await fixture.db.delete(realtimeOutbox);
  await fixture.db.update(user).set({ updatedAt: new Date() }).where(eq(user.id, "alice"));
  expect(
    (await readChanges(fixture.db)).filter((change) => change.audience[0] === "conversation"),
  ).toEqual([]);
});

test("user picture insert, replacement and deletion reach external conversation readers without file data", async () => {
  const conversations = await profileConversations();
  const fileIds = [crypto.randomUUID(), crypto.randomUUID()];
  await fixture.db.insert(storedFiles).values(
    fileIds.map((id) => ({
      id,
      ownerUserId: "alice",
      uploadedBy: "alice",
      purpose: "avatar",
      filename: "Secret.webp",
      contentType: "image/webp",
      size: 12,
      objectKey: `object-key/${id}`,
      sha256: "Secret-sha256",
    })),
  );
  const fileId = fileIds[0];
  const replacementId = fileIds[1];
  if (!fileId || !replacementId) throw new Error("Missing file IDs");
  await fixture.db
    .insert(userPictures)
    .values({ id: crypto.randomUUID(), userId: "alice", fileId });
  await expectProfileRouting(conversations);
  expect(JSON.stringify(await readChanges(fixture.db))).not.toContain(fileId);
  await fixture.db.delete(realtimeOutbox);
  await fixture.db
    .update(userPictures)
    .set({ fileId: replacementId })
    .where(eq(userPictures.userId, "alice"));
  await expectProfileRouting(conversations);
  expect(JSON.stringify(await readChanges(fixture.db))).not.toContain(replacementId);
  await fixture.db.delete(realtimeOutbox);
  await fixture.db.delete(userPictures).where(eq(userPictures.userId, "alice"));
  await expectProfileRouting(conversations);
});
