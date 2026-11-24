import { storedFiles, user, userAgents } from "../../../schema";
import { ownedAgent } from "../../../testing/agents";
import { setupDatabase } from "../../../testing/database";
import { messagingMessages, messagingParticipants } from "../schema";
import { selectMessages } from "./messages";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();

test("message author metadata uses joins instead of per-message SQL subplans", async () => {
  const agent = await ownedAgent(f);
  const humanImage = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;
  await f.db.update(user).set({ image: humanImage }).where(eq(user.id, "alice"));
  const fileId = crypto.randomUUID();
  await f.db.insert(storedFiles).values({
    id: fileId,
    ownerUserId: "alice",
    uploadedBy: "alice",
    purpose: "avatar",
    filename: "agent.webp",
    contentType: "image/webp",
    size: 10,
    objectKey: `pictures/${fileId}`,
    sha256: "hash",
  });
  await f.db
    .update(userAgents)
    .set({ imageFileId: fileId })
    .where(eq(userAgents.id, agent.agentId));
  const conversation = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "Authors" });
  await f.db.insert(messagingParticipants).values({
    organizationId: f.orgA,
    conversationId: conversation.id,
    actorEntityId: agent.actorId,
    actorType: "agent",
  });
  await f.db.insert(messagingMessages).values(
    [f.alice, agent.actorId].flatMap((authorActorEntityId) =>
      Array.from({ length: 3 }, () => ({
        conversationId: conversation.id,
        authorOrganizationId: f.orgA,
        authorActorEntityId,
        body: "Metadata",
      })),
    ),
  );
  const query = (userId: string, organizationId = f.orgA) =>
    selectMessages(f.db, { organizationId, userId }).where(
      eq(messagingMessages.conversationId, conversation.id),
    );
  const ownerRows = await query("alice");
  expect(ownerRows).toHaveLength(6);
  for (const row of ownerRows) {
    const isAgent = row.message.authorActorEntityId === agent.actorId;
    expect(row).toMatchObject({
      authorName: isAgent ? "Research" : "Alice",
      authorImage: isAgent ? `/api/v1/files/${fileId}/content` : humanImage,
      authorType: isAgent ? "agent" : "human",
      authorExternal: false,
    });
  }
  for (const row of await query("bob")) {
    expect(row.authorImage).toBe(row.authorType === "agent" ? null : humanImage);
  }
  for (const row of await query("outsider", f.orgB)) {
    expect(row.authorImage).toBeNull();
    expect(row.authorExternal).toBe(row.authorType !== "agent");
  }
  await f.db
    .update(user)
    .set({ name: "Renamed", image: "https://example.test/tracker.png" })
    .where(eq(user.id, "alice"));
  const renamed = (await query("alice")).find((row) => row.authorType === "human")!;
  expect(renamed).toMatchObject({ authorName: "Renamed", authorImage: null });

  const plan = await f.db.execute(sql`explain (format json) ${query("alice").getSQL()}`);
  expect(JSON.stringify(plan)).not.toContain('"Subplan Name"');
});
