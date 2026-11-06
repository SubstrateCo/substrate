import { setupDatabase } from "../../testing/database";
import { user } from "../authentication/schema";
import { member, organization } from "../organizations/schema";
import { createStorageRepository, type StorageScope } from "./repository";
import { storedFiles, storageCandidates, userPictures, organizationPictures } from "./schema";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
function repositoryWithAuthWrites() {
  const repository = createStorageRepository(f.db);
  return {
    ...repository,
    async setPicture(
      scope: StorageScope,
      purpose: "avatar" | "organization-logo",
      fileId: string | null,
    ) {
      await repository.validatePicture(scope, purpose, fileId);
      const url = fileId ? `/api/v1/files/${fileId}/content` : null;
      if (purpose === "avatar")
        await f.db.update(user).set({ image: url }).where(eq(user.id, scope.userId));
      else
        await f.db
          .update(organization)
          .set({ logo: url })
          .where(eq(organization.id, scope.organizationId!));
      return { fileId, url };
    },
  };
}
const file = (purpose = "avatar", organizationId: string | null = null) => ({
  id: crypto.randomUUID(),
  ownerUserId: organizationId ? null : "alice",
  organizationId,
  uploadedBy: "alice",
  purpose,
  filename: "picture.png",
  contentType: "image/webp",
  size: 200,
  objectKey: crypto.randomUUID(),
  sha256: "a".repeat(64),
});

describe("stored file relationships", () => {
  test("upload and completion whitelist input fields instead of accepting extra persistence fields", async () => {
    const repo = createStorageRepository(f.db);
    const scope = { userId: "alice", organizationId: f.orgA };
    const id = crypto.randomUUID();
    const input = Object.assign(
      { purpose: "file" as const, filename: "report.txt", contentType: "text/plain", size: 5 },
      { createdAt: new Date(0), deletedAt: new Date(0), temporaryCleanedAt: new Date(0) },
    );
    const upload = await repo.createUpload(scope, input, id, new Date(Date.now() + 60_000));
    expect(upload.createdAt.getTime()).toBeGreaterThan(0);
    expect(upload.deletedAt).toBeNull();
    expect(upload.temporaryCleanedAt).toBeNull();
    const verified = Object.assign(
      {
        objectKey: `objects/${id}/hash`,
        contentType: "text/plain",
        size: 5,
        sha256: "a".repeat(64),
      },
      {
        id: crypto.randomUUID(),
        uploadedBy: "outsider",
        organizationId: f.orgB,
        purpose: "organization-logo",
        filename: "spoof.txt",
        createdAt: new Date(0),
      },
    );
    const completed = await repo.complete(scope, id, verified);
    expect(completed.id).toBe(id);
    expect(completed.uploadedBy).toBe("alice");
    expect(completed.organizationId).toBe(f.orgA);
    expect(completed.purpose).toBe("file");
    expect(completed.filename).toBe("report.txt");
    expect(completed.createdAt.getTime()).toBeGreaterThan(0);
  });

  test("PostgreSQL rejects mismatched owners, purpose, and malformed ownership", async () => {
    const avatar = file();
    await f.db.insert(storedFiles).values(avatar);
    await expect(
      f.db
        .insert(userPictures)
        .values({ id: crypto.randomUUID(), userId: "bob", fileId: avatar.id })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      f.db
        .insert(storedFiles)
        .values({ ...file(), organizationId: f.orgA })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      f.db
        .insert(organizationPictures)
        .values({ id: crypto.randomUUID(), organizationId: f.orgA, fileId: avatar.id })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    const logo = file("organization-logo", f.orgA);
    await f.db.insert(storedFiles).values(logo);
    await expect(
      f.db
        .insert(organizationPictures)
        .values({ id: crypto.randomUUID(), organizationId: f.orgB, fileId: logo.id })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  test("picture attachment updates the auth field atomically and blocks other owners", async () => {
    const avatar = file();
    await f.db.insert(storedFiles).values(avatar);
    const repo = repositoryWithAuthWrites();
    const alice = { userId: "alice", organizationId: f.orgA };
    await expect(
      repo.setPicture({ userId: "bob", organizationId: f.orgA }, "avatar", avatar.id),
    ).rejects.toThrow();
    await repo.setPicture(alice, "avatar", avatar.id);
    const [saved] = await f.db.select().from(user).where(eq(user.id, "alice"));
    expect(saved!.image).toBe(`/api/v1/files/${avatar.id}/content`);
    expect((await repo.getReadable({ userId: "bob", organizationId: f.orgA }, avatar.id))?.id).toBe(
      avatar.id,
    );
    expect(
      await repo.getReadable({ userId: "outsider", organizationId: f.orgB }, avatar.id),
    ).toBeNull();
    await repo.setPicture(alice, "avatar", null);
    expect(await repo.getReadable({ userId: "bob", organizationId: f.orgA }, avatar.id)).toBeNull();
    expect((await f.db.select().from(user).where(eq(user.id, "alice")))[0]!.image).toBeNull();
  });

  test("generic files are uploader-only, even within the organization", async () => {
    const generic = file("file", f.orgA);
    await f.db.insert(storedFiles).values({ ...generic, contentType: "application/pdf" });
    const repo = repositoryWithAuthWrites();
    expect(
      (await repo.getReadable({ userId: "alice", organizationId: f.orgA }, generic.id))?.id,
    ).toBe(generic.id);
    expect(
      await repo.getReadable({ userId: "bob", organizationId: f.orgA }, generic.id),
    ).toBeNull();
    expect(
      await repo.getReadable({ userId: "alice", organizationId: f.orgB }, generic.id),
    ).toBeNull();
  });

  test("concurrent completion converges; delete is owner-only and cannot be undone by completion", async () => {
    const repo = repositoryWithAuthWrites();
    const scope = { userId: "alice", organizationId: f.orgA };
    const id = crypto.randomUUID();
    const upload = await repo.createUpload(
      scope,
      { purpose: "file", filename: "x.txt", contentType: "text/plain", size: 5 },
      id,
      new Date(Date.now() + 60_000),
    );
    expect(upload.temporaryKey).toBe(`temporary/organizations/${f.orgA}/file/${id}`);
    const verified = {
      objectKey: `objects/${id}/hash`,
      contentType: "text/plain",
      size: 5,
      sha256: "a".repeat(64),
    };
    const results = await Promise.all([
      repo.complete(scope, id, verified),
      repo.complete(scope, id, { ...verified, objectKey: `objects/${id}/loser` }),
    ]);
    expect(results[0].objectKey).toBe(results[1].objectKey);
    await expect(repo.deleteFile({ userId: "bob", organizationId: f.orgA }, id)).rejects.toThrow();
    await repo.deleteFile(scope, id);
    expect(await repo.getReadable(scope, id)).toBeNull();
    await expect(repo.complete(scope, id, verified)).rejects.toThrow();
    expect(
      (await repo.cleanupCandidates(new Date(Date.now() + 1000))).map((row) => row.objectKey),
    ).toContain(results[0].objectKey);
  });

  test("logo management needs admin role, and attachments cannot be deleted directly", async () => {
    const repo = repositoryWithAuthWrites();
    const logo = file("organization-logo", f.orgA);
    await f.db.insert(storedFiles).values(logo);
    await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "bob"));
    await expect(
      repo.setPicture({ userId: "bob", organizationId: f.orgA }, "organization-logo", logo.id),
    ).rejects.toThrow();
    await repo.setPicture(
      { userId: "alice", organizationId: f.orgA },
      "organization-logo",
      logo.id,
    );
    const [saved] = await f.db.select().from(organization).where(eq(organization.id, f.orgA));
    expect(saved!.logo).toBe(`/api/v1/files/${logo.id}/content`);
    expect((await repo.getReadable({ userId: "bob", organizationId: f.orgA }, logo.id))?.id).toBe(
      logo.id,
    );
    await expect(
      repo.deleteFile({ userId: "alice", organizationId: f.orgA }, logo.id),
    ).rejects.toThrow();
  });

  test("cleanup prunes only unused old pictures; generic files and attached pictures stay", async () => {
    const repo = repositoryWithAuthWrites();
    const old = new Date(0);
    const unattached = { ...file(), createdAt: old };
    const attached = { ...file(), createdAt: old };
    const generic = { ...file("file", f.orgA), createdAt: old };
    await f.db.insert(storedFiles).values([unattached, attached, generic]);
    await repo.setPicture({ userId: "alice", organizationId: f.orgA }, "avatar", attached.id);
    await repo.pruneUnusedFiles(new Date());
    expect(await repo.getCompleted(unattached.id)).toBeNull();
    expect((await repo.getCompleted(attached.id))?.id).toBe(attached.id);
    expect((await repo.getCompleted(generic.id))?.id).toBe(generic.id);
  });

  test("organization deletion preserves final-object cleanup intent", async () => {
    const repo = repositoryWithAuthWrites();
    const logo = file("organization-logo", f.orgA);
    await f.db
      .insert(storageCandidates)
      .values({ objectKey: logo.objectKey, createdAt: new Date(0) });
    await f.db.insert(storedFiles).values(logo);
    await repo.setPicture(
      { userId: "alice", organizationId: f.orgA },
      "organization-logo",
      logo.id,
    );
    await f.db.delete(organization).where(eq(organization.id, f.orgA));
    expect(await repo.getCompleted(logo.id)).toBeNull();
    expect((await repo.cleanupCandidates(new Date())).map((row) => row.objectKey)).toContain(
      logo.objectKey,
    );
  });

  test("uploader deletion keeps the organization logo but cleans ownerless private files", async () => {
    const repo = repositoryWithAuthWrites();
    // This storage-only identity has no actor history that would prevent account deletion.
    await f.db
      .insert(user)
      .values({ id: "uploader", name: "Uploader", email: "uploader@example.com" });
    await f.db
      .insert(member)
      .values({ id: "uploader-a", userId: "uploader", organizationId: f.orgA, role: "owner" });
    const logo = {
      ...file("organization-logo", f.orgA),
      uploadedBy: "uploader",
      createdAt: new Date(0),
    };
    const generic = { ...file("file", f.orgA), uploadedBy: "uploader", createdAt: new Date(0) };
    const avatar = {
      ...file(),
      ownerUserId: "uploader",
      uploadedBy: "uploader",
      createdAt: new Date(0),
    };
    await f.db.insert(storageCandidates).values(
      [logo, generic, avatar].map((file) => ({
        objectKey: file.objectKey,
        createdAt: new Date(0),
      })),
    );
    await f.db.insert(storedFiles).values([logo, generic, avatar]);
    const scope = { userId: "uploader", organizationId: f.orgA };
    await repo.setPicture(scope, "organization-logo", logo.id);
    await repo.setPicture(scope, "avatar", avatar.id);
    await f.db.delete(user).where(eq(user.id, "uploader"));
    await repo.pruneUnusedFiles(new Date());
    expect((await repo.getReadable({ userId: "bob", organizationId: f.orgA }, logo.id))?.id).toBe(
      logo.id,
    );
    expect(await repo.getCompleted(generic.id)).toBeNull();
    expect(await repo.getCompleted(avatar.id)).toBeNull();
    const candidates = (await repo.cleanupCandidates(new Date())).map((row) => row.objectKey);
    expect(candidates).toContain(generic.objectKey);
    expect(candidates).toContain(avatar.objectKey);
    expect(candidates).not.toContain(logo.objectKey);
  });
});
