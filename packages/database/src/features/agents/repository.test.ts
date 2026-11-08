import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { createStorageRepository } from "../../core/storage/repository";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ConflictError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { createAgentRepository } from "./repository";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const agent = { name: "Helper", instructions: "Help", harness: "opencode" as const, enabled: true };

const avatar = () => ({
  id: crypto.randomUUID(),
  ownerUserId: "alice",
  uploadedBy: "alice",
  purpose: "avatar",
  filename: "avatar.webp",
  contentType: "image/webp",
  size: 200,
  objectKey: crypto.randomUUID(),
  sha256: "a".repeat(64),
});

test("agent pictures require a live owned agent and a completed owned avatar", async () => {
  const owner = createAgentRepository(f.db, "alice");
  const saved = await owner.saveAgent(agent);
  expect(saved.image).toBeNull();
  const picture = avatar();
  const foreign = { ...avatar(), ownerUserId: "bob", uploadedBy: "bob" };
  const logo = {
    ...avatar(),
    ownerUserId: null,
    organizationId: f.orgA,
    purpose: "organization-logo",
  };
  const raw = { ...logo, id: crypto.randomUUID(), objectKey: crypto.randomUUID(), purpose: "file" };
  await f.db.insert(storedFiles).values([picture, foreign, logo, raw]);
  const pending = await createStorageRepository(f.db).createUpload(
    { userId: "alice", organizationId: null },
    { purpose: "avatar", filename: "avatar.png", contentType: "image/png", size: 200 },
    crypto.randomUUID(),
    new Date(Date.now() + 60000),
  );
  for (const fileId of [crypto.randomUUID(), pending.id, foreign.id, logo.id, raw.id])
    await expect(owner.setPicture(saved.id, fileId)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    createAgentRepository(f.db, "bob").setPicture(saved.id, picture.id),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  const updated = await owner.setPicture(saved.id, picture.id);
  expect(updated.image).toBe(`/api/v1/files/${picture.id}/content`);
  expect((await owner.list()).agents[0]?.image).toBe(updated.image);
  expect((await owner.saveAgent({ ...agent, id: saved.id })).image).toBe(updated.image);
  expect((await owner.setPicture(saved.id, null)).image).toBeNull();
  await owner.deleteAgent(saved.id);
  await expect(owner.setPicture(saved.id, picture.id)).rejects.toBeInstanceOf(AccessDeniedError);
});

test("agent avatars survive cleanup and cannot be deleted until cleared or agent deletion", async () => {
  const owner = createAgentRepository(f.db, "alice");
  const storage = createStorageRepository(f.db);
  const scope = { userId: "alice", organizationId: null };
  const saved = await owner.saveAgent(agent);
  const picture = avatar();
  await f.db.insert(storedFiles).values(picture);
  await owner.setPicture(saved.id, picture.id);
  await expect(storage.deleteFile(scope, picture.id)).rejects.toBeInstanceOf(ConflictError);
  await storage.pruneUnusedFiles(new Date(Date.now() + 60000));
  expect(await storage.getReadable(scope, picture.id)).toMatchObject({ id: picture.id });
  await owner.setPicture(saved.id, null);
  await storage.deleteFile(scope, picture.id);
  expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, picture.id))).toEqual([]);
  const next = avatar();
  await f.db.insert(storedFiles).values(next);
  await owner.setPicture(saved.id, next.id);
  await owner.deleteAgent(saved.id);
  const [row] = await f.db.select().from(userAgents).where(eq(userAgents.id, saved.id));
  expect(row?.imageFileId).toBeNull();
  await storage.pruneUnusedFiles(new Date(Date.now() + 60000));
  expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, next.id))).toEqual([]);
});

test("PostgreSQL enforces agent picture owner and fixed purpose", async () => {
  const saved = await createAgentRepository(f.db, "bob").saveAgent(agent);
  const picture = avatar();
  await f.db.insert(storedFiles).values(picture);
  await expect(
    f.db
      .update(userAgents)
      .set({ imageFileId: picture.id })
      .where(eq(userAgents.id, saved.id))
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    f.db
      .update(userAgents)
      .set({ picturePurpose: "file" })
      .where(eq(userAgents.id, saved.id))
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
});

test("user definitions do not require organization membership and cannot cross owners", async () => {
  await f.db.insert(user).values({ id: "solo", name: "Solo", email: "solo@example.com" });
  const owner = createAgentRepository(f.db, "solo");
  const other = createAgentRepository(f.db, "bob");
  const saved = await owner.saveAgent(agent);
  expect(saved.useStartupDefaults).toBe(true);
  expect((await other.list()).agents).toEqual([]);
  await expect(other.saveAgent({ ...agent, id: saved.id, name: "Changed" })).rejects.toThrow();
  await expect(other.deleteAgent(saved.id)).rejects.toThrow();
  expect((await owner.list()).agents[0]?.name).toBe("Helper");
  const updated = await owner.saveAgent({
    ...agent,
    id: saved.id,
    name: "Updated",
    model: "test-model",
    enabled: false,
    useStartupDefaults: false,
  });
  expect(updated).toMatchObject({
    id: saved.id,
    name: "Updated",
    model: "test-model",
    enabled: false,
    useStartupDefaults: false,
  });
});

test("deletion retains identity and updates cannot restore it", async () => {
  const owner = createAgentRepository(f.db, "alice");
  const saved = await owner.saveAgent({ ...agent, model: "old-model" });
  expect(await owner.saveAgent({ ...agent, id: saved.id })).not.toHaveProperty("model");
  await owner.deleteAgent(saved.id);
  expect((await owner.list()).agents).toEqual([]);
  const [retained] = await f.db.select().from(userAgents).where(eq(userAgents.id, saved.id));
  expect(retained?.deletedAt).toBeInstanceOf(Date);
  expect(retained?.enabled).toBe(false);
  await expect(owner.saveAgent({ ...agent, id: saved.id })).rejects.toThrow();
});
