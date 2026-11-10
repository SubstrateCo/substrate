import { storedFiles, user, userAgents } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { actorPicture } from "./picture";
import { actors } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const f = setupDatabase();

test("actor pictures expose only managed pictures of fellow workspace members", async () => {
  const image = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;
  await f.db.update(user).set({ image }).where(eq(user.id, "alice"));
  const actor = alias(actors, "pictured_actor");
  const read = async (organizationId: string) =>
    (
      await f.db
        .select({ image: actorPicture({ organizationId, userId: "bob" }, actor) })
        .from(actor)
        .where(eq(actor.entityId, f.alice))
    )[0]!.image;
  expect(await read(f.orgA)).toBe(image);
  expect(await read(f.orgB)).toBeNull();
  await f.db
    .update(user)
    .set({ image: "https://example.test/tracker.png" })
    .where(eq(user.id, "alice"));
  expect(await read(f.orgA)).toBeNull();
  await f.db.update(user).set({ image: null }).where(eq(user.id, "alice"));
  expect(await read(f.orgA)).toBeNull();
});

test("agent pictures stay owner-only for both session and repository scopes", async () => {
  const agent = await ownedAgent(f);
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
  const read = async (scope: Parameters<typeof actorPicture>[0]) =>
    (
      await f.db
        .select({ image: actorPicture(scope) })
        .from(actors)
        .where(eq(actors.entityId, agent.actorId))
    )[0]!.image;
  const image = `/api/v1/files/${fileId}/content`;
  expect(await read({ organizationId: f.orgA, userId: "alice" })).toBe(image);
  expect(await read({ organizationId: f.orgA, actorEntityId: f.alice })).toBe(image);
  expect(await read({ organizationId: f.orgA, actorEntityId: agent.actorId })).toBe(image);
  expect(await read({ organizationId: f.orgA, userId: "bob" })).toBeNull();
  expect(await read({ organizationId: f.orgA, actorEntityId: f.bob })).toBeNull();
  await f.db.update(userAgents).set({ imageFileId: null }).where(eq(userAgents.id, agent.agentId));
  expect(await read({ organizationId: f.orgA, userId: "alice" })).toBeNull();
});
