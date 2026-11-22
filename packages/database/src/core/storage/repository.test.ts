import { AccessDeniedError, ConflictError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { user } from "../authentication/schema";
import { member, organization } from "../organizations/schema";
import { createStorageRepository } from "./repository";
import { fileUploads, storedFiles, storageCandidates } from "./schema";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
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
  test("limits outstanding generic upload tickets per uploader", async () => {
    const repo = createStorageRepository(f.db);
    const scope = { userId: "alice", organizationId: f.orgA };
    const create = () =>
      repo.createUpload(
        scope,
        { purpose: "file", filename: "draft.txt", contentType: "text/plain", size: 5 },
        crypto.randomUUID(),
        new Date(Date.now() + 60_000),
      );
    const pending = await Promise.all(Array.from({ length: 20 }, create));
    expect(await rejection(create())).toBeInstanceOf(ConflictError);
    await repo.complete(scope, pending[0]!.id, {
      objectKey: crypto.randomUUID(),
      contentType: "text/plain",
      size: 5,
      sha256: "a".repeat(64),
    });
    expect((await create()).uploadedBy).toBe("alice");
  });
  test.each(["avatar", "file"] as const)(
    "authorized %s lookup includes completion without a separate query, including expired replays",
    async (purpose) => {
      const { db, queries } = recordQueries();
      const repo = createStorageRepository(db);
      const scope = { userId: "alice", organizationId: purpose === "avatar" ? null : f.orgA };
      const id = crypto.randomUUID();
      const upload = await repo.createUpload(
        scope,
        { purpose, filename: "a.webp", contentType: "image/webp", size: 5 },
        id,
        new Date(Date.now() + 60_000),
      );
      queries.length = 0;
      expect(await repo.getUpload(scope, id)).toEqual({ upload, completed: null });
      expect(queries).toHaveLength(1);
      const completed = await repo.complete(scope, id, {
        objectKey: `objects/${id}/hash`,
        contentType: "image/webp",
        size: 5,
        sha256: "a".repeat(64),
      });
      await db
        .update(fileUploads)
        .set({ expiresAt: new Date(0) })
        .where(eq(fileUploads.id, id));
      queries.length = 0;
      expect(await repo.getUpload(scope, id)).toEqual({
        upload: { ...upload, expiresAt: new Date(0) },
        completed,
      });
      expect(queries).toHaveLength(1);
      expect(
        await repo.complete(scope, id, {
          objectKey: `objects/${id}/late`,
          contentType: "image/webp",
          size: 5,
          sha256: "b".repeat(64),
        }),
      ).toEqual(completed);
    },
  );

  test("completion state does not bypass uploader, organization, membership, role, or deletion gates", async () => {
    const repo = createStorageRepository(f.db);
    const scope = { userId: "alice", organizationId: f.orgA };
    const id = crypto.randomUUID();
    await repo.createUpload(
      scope,
      { purpose: "organization-logo", filename: "a.webp", contentType: "image/webp", size: 5 },
      id,
      new Date(Date.now() + 60_000),
    );
    await repo.complete(scope, id, {
      objectKey: `objects/${id}/hash`,
      contentType: "image/webp",
      size: 5,
      sha256: "a".repeat(64),
    });
    expect(await rejection(repo.getUpload({ ...scope, userId: "bob" }, id))).toBeInstanceOf(
      AccessDeniedError,
    );
    expect(
      await rejection(repo.getUpload({ ...scope, organizationId: f.orgB }, id)),
    ).toBeInstanceOf(AccessDeniedError);
    await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
    expect(await rejection(repo.getUpload(scope, id))).toBeInstanceOf(AccessDeniedError);
    await f.db.delete(member).where(eq(member.id, "alice-a"));
    expect(await rejection(repo.getUpload(scope, id))).toBeInstanceOf(AccessDeniedError);
    await f.db
      .insert(member)
      .values({ id: "alice-a", userId: "alice", organizationId: f.orgA, role: "owner" });
    await f.db.update(fileUploads).set({ deletedAt: new Date() }).where(eq(fileUploads.id, id));
    // Even an inconsistent surviving completed row cannot override the deletion marker.
    expect(await rejection(repo.getUpload(scope, id))).toBeInstanceOf(ConflictError);
  });

  test("completion rechecks membership, deletion, and expiry after the initial authorized read", async () => {
    const repo = createStorageRepository(f.db);
    const scope = { userId: "alice", organizationId: f.orgA };
    const id = crypto.randomUUID();
    await repo.createUpload(
      scope,
      { purpose: "file", filename: "a.txt", contentType: "text/plain", size: 5 },
      id,
      new Date(Date.now() + 60_000),
    );
    await repo.getUpload(scope, id);
    const verified = {
      objectKey: `objects/${id}/hash`,
      contentType: "text/plain",
      size: 5,
      sha256: "a".repeat(64),
    };
    await f.db.delete(member).where(eq(member.id, "alice-a"));
    expect(await rejection(repo.complete(scope, id, verified))).toBeInstanceOf(AccessDeniedError);
    expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, id))).toEqual([]);
    await f.db
      .insert(member)
      .values({ id: "alice-a", userId: "alice", organizationId: f.orgA, role: "owner" });
    await f.db
      .update(fileUploads)
      .set({ expiresAt: new Date(0) })
      .where(eq(fileUploads.id, id));
    expect(await rejection(repo.complete(scope, id, verified))).toMatchObject({
      message: expect.stringContaining("Upload expired"),
    });
    expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, id))).toEqual([]);
    await f.db
      .update(fileUploads)
      .set({ expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(fileUploads.id, id));
    await repo.complete(scope, id, verified);
    await repo.getUpload(scope, id);
    await repo.deleteFile(scope, id);
    expect(await rejection(repo.complete(scope, id, verified))).toBeInstanceOf(ConflictError);
    expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, id))).toEqual([]);
  });

  test("an upload row stays while its messages matter and goes when cleanup removes its temporary object", async () => {
    const repo = createStorageRepository(f.db);
    const scope = { userId: "alice", organizationId: f.orgA };
    const id = crypto.randomUUID();
    await repo.createUpload(
      scope,
      { purpose: "file", filename: "a.txt", contentType: "text/plain", size: 5 },
      id,
      new Date(Date.now() + 60_000),
    );
    const verified = {
      objectKey: `objects/${id}/a`,
      contentType: "text/plain",
      size: 5,
      sha256: "a".repeat(64),
    };
    await repo.complete(scope, id, verified);
    await repo.deleteFile(scope, id);
    expect(await rejection(repo.getUpload(scope, id))).toMatchObject({
      message: expect.stringContaining("File was deleted. Start a new upload."),
    });

    await f.db
      .update(fileUploads)
      .set({ expiresAt: new Date(Date.now() - 48 * 60 * 60_000) })
      .where(eq(fileUploads.id, id));
    const before = new Date(Date.now() - 24 * 60 * 60_000);
    expect((await repo.expiredUploads(before)).map((upload) => upload.id)).toEqual([id]);
    await repo.forgetUploads([id]);
    expect(await f.db.select().from(fileUploads).where(eq(fileUploads.id, id))).toEqual([]);
    expect(await repo.expiredUploads(before)).toEqual([]);
  });

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

  test("PostgreSQL rejects malformed file ownership", async () => {
    expect(
      await rejection(
        f.db
          .insert(storedFiles)
          .values({ ...file(), organizationId: f.orgA })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23514" } });
  });

  test("profile pictures are readable only by their owner or members of the active shared organization", async () => {
    const repo = createStorageRepository(f.db);
    expect(
      await repo.canReadPicture({ userId: "alice", organizationId: null }, "avatar", "alice"),
    ).toBe(true);
    expect(
      await repo.canReadPicture({ userId: "bob", organizationId: f.orgA }, "avatar", "alice"),
    ).toBe(true);
    expect(
      await repo.canReadPicture({ userId: "outsider", organizationId: f.orgA }, "avatar", "alice"),
    ).toBe(false);
    expect(
      await repo.canReadPicture({ userId: "outsider", organizationId: f.orgB }, "avatar", "alice"),
    ).toBe(false);
    expect(
      await repo.canReadPicture({ userId: "bob", organizationId: null }, "avatar", "alice"),
    ).toBe(false);
    expect(
      await repo.canReadPicture(
        { userId: "bob", organizationId: f.orgA },
        "organization-logo",
        f.orgA,
      ),
    ).toBe(true);
    expect(
      await repo.canReadPicture(
        { userId: "bob", organizationId: f.orgA },
        "organization-logo",
        f.orgB,
      ),
    ).toBe(false);
    await f.db.delete(member).where(eq(member.id, "bob-a"));
    expect(
      await repo.canReadPicture(
        { userId: "bob", organizationId: f.orgA },
        "organization-logo",
        f.orgA,
      ),
    ).toBe(false);
  });

  test("unattached agent uploads remain private and can be deleted", async () => {
    const avatar = file();
    await f.db.insert(storedFiles).values(avatar);
    const repo = createStorageRepository(f.db);
    expect(await repo.getReadable({ userId: "bob", organizationId: f.orgA }, avatar.id)).toBeNull();
    expect(
      await repo.getReadable({ userId: "outsider", organizationId: f.orgA }, avatar.id),
    ).toBeNull();
    await repo.deleteFile({ userId: "alice", organizationId: null }, avatar.id);
    expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, avatar.id))).toEqual([]);
  });

  test("generic files are uploader-only, even within the organization", async () => {
    const generic = file("file", f.orgA);
    await f.db.insert(storedFiles).values({ ...generic, contentType: "application/pdf" });
    const repo = createStorageRepository(f.db);
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
    const repo = createStorageRepository(f.db);
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
    expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, id))).toHaveLength(1);
    await rejection(repo.deleteFile({ userId: "bob", organizationId: f.orgA }, id));
    await repo.deleteFile(scope, id);
    expect(await repo.getReadable(scope, id)).toBeNull();
    await rejection(repo.complete(scope, id, verified));
    expect(
      (await repo.cleanupCandidates(new Date(Date.now() + 1000))).map((row) => row.objectKey),
    ).toContain(results[0].objectKey);
  });

  test.each(["delete", "prune"] as const)(
    "completion cannot resurrect a file during concurrent %s",
    async (operation) => {
      const repo = createStorageRepository(f.db);
      const scope = { userId: "alice", organizationId: f.orgA };
      const id = crypto.randomUUID();
      await repo.createUpload(
        scope,
        { purpose: "file", filename: "a.txt", contentType: "text/plain", size: 5 },
        id,
        new Date(Date.now() + 60_000),
      );
      const verified = {
        objectKey: `objects/${id}/hash`,
        contentType: "text/plain",
        size: 5,
        sha256: "a".repeat(64),
      };
      await repo.complete(scope, id, verified);
      await f.db
        .update(storedFiles)
        .set({ createdAt: new Date(0) })
        .where(eq(storedFiles.id, id));
      const [first, second, removed] = await Promise.allSettled([
        repo.complete(scope, id, verified),
        repo.complete(scope, id, verified),
        operation === "delete" ? repo.deleteFile(scope, id) : repo.pruneUnusedFiles(new Date()),
      ]);
      expect(removed.status).toBe("fulfilled");
      for (const completion of [first, second]) {
        if (completion.status === "rejected")
          expect(completion.reason).toBeInstanceOf(ConflictError);
        else expect(completion.value.id).toBe(id);
      }
      expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, id))).toEqual([]);
      const [upload] = await f.db.select().from(fileUploads).where(eq(fileUploads.id, id));
      expect(upload?.deletedAt).toBeInstanceOf(Date);
      expect(await rejection(repo.complete(scope, id, verified))).toBeInstanceOf(ConflictError);
    },
  );

  test("logo writes need an active organization and admin or owner role", async () => {
    const repo = createStorageRepository(f.db);
    await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "bob"));
    await rejection(
      repo.requirePictureAccess({ userId: "bob", organizationId: f.orgA }, "organization-logo"),
    );
    await repo.requirePictureAccess(
      { userId: "alice", organizationId: f.orgA },
      "organization-logo",
    );
    await rejection(
      repo.requirePictureAccess({ userId: "alice", organizationId: null }, "organization-logo"),
    );
    await f.db.update(member).set({ role: "admin" }).where(eq(member.id, "bob-a"));
    await repo.requirePictureAccess({ userId: "bob", organizationId: f.orgA }, "organization-logo");
  });

  test("cleanup prunes old unpublished files, including abandoned attachment uploads", async () => {
    const repo = createStorageRepository(f.db);
    const old = new Date(0);
    const unattached = { ...file(), createdAt: old };
    const generic = { ...file("file", f.orgA), createdAt: old };
    await f.db.insert(storedFiles).values([unattached, generic]);
    await repo.pruneUnusedFiles(new Date());
    const remaining = await f.db.select({ id: storedFiles.id }).from(storedFiles);
    expect(remaining).toEqual([]);
  });

  test("organization deletion preserves final-object cleanup intent", async () => {
    const repo = createStorageRepository(f.db);
    const logo = file("organization-logo", f.orgA);
    await f.db
      .insert(storageCandidates)
      .values({ objectKey: logo.objectKey, createdAt: new Date(0) });
    await f.db.insert(storedFiles).values(logo);
    await f.db.delete(organization).where(eq(organization.id, f.orgA));
    expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, logo.id))).toEqual([]);
    expect((await repo.cleanupCandidates(new Date())).map((row) => row.objectKey)).toContain(
      logo.objectKey,
    );
  });

  test("uploader deletion cleans ownerless managed files", async () => {
    const repo = createStorageRepository(f.db);
    // This storage-only identity has no actor history that would prevent account deletion.
    await f.db
      .insert(user)
      .values({ id: "uploader", name: "Uploader", email: "uploader@example.com" });
    await f.db
      .insert(member)
      .values({ id: "uploader-a", userId: "uploader", organizationId: f.orgA, role: "owner" });
    const generic = { ...file("file", f.orgA), uploadedBy: "uploader", createdAt: new Date(0) };
    const avatar = {
      ...file(),
      ownerUserId: "uploader",
      uploadedBy: "uploader",
      createdAt: new Date(0),
    };
    await f.db.insert(storageCandidates).values(
      [generic, avatar].map((file) => ({
        objectKey: file.objectKey,
        createdAt: new Date(0),
      })),
    );
    await f.db.insert(storedFiles).values([generic, avatar]);
    await f.db.delete(user).where(eq(user.id, "uploader"));
    await repo.pruneUnusedFiles(new Date());
    expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, generic.id))).toEqual([]);
    expect(await f.db.select().from(storedFiles).where(eq(storedFiles.id, avatar.id))).toEqual([]);
    const candidates = (await repo.cleanupCandidates(new Date())).map((row) => row.objectKey);
    expect(candidates).toContain(generic.objectKey);
    expect(candidates).toContain(avatar.objectKey);
  });
});
