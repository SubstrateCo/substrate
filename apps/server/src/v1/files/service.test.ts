import type { StorageRepository } from "@substrate/database/storage";

import { ObjectNotFoundError, type ObjectStorage } from "../../storage/types";
import { createFileService } from "./service";
import { describe, expect, mock, test } from "bun:test";
import { rejects } from "node:assert/strict";
import sharp from "sharp";

function fixture() {
  const id = crypto.randomUUID();
  const upload = {
    id,
    uploadedBy: "alice",
    ownerUserId: null,
    organizationId: "org",
    purpose: "file",
    filename: "a.txt",
    contentType: "text/plain",
    size: 5,
    temporaryKey: `temporary/${id}`,
    expiresAt: new Date(Date.now() + 60_000),
    temporaryCleanedAt: null,
    deletedAt: null,
    createdAt: new Date(),
  };
  let completed: Awaited<ReturnType<StorageRepository["getUpload"]>>["completed"] = null;
  const objects = new Map<string, Uint8Array>([
    [upload.temporaryKey, new TextEncoder().encode("hello")],
  ]);
  const candidates = new Set(["orphan"]);
  const forgottenCandidates: string[][] = [];
  const forgottenUploads: string[][] = [];
  const removedBatches: string[][] = [];
  const expiredUploads = new Map<string, { id: string; temporaryKey: string }>([
    [id, { id, temporaryKey: upload.temporaryKey }],
  ]);
  const repository: StorageRepository = {
    createUpload: async () => upload,
    getUpload: async () => ({ upload, completed }),
    addCandidate: async () => {},
    complete: async (_scope, _id, data) =>
      (completed ??= { ...upload, ...data, publishedAt: null }),
    requirePictureAccess: async () => {},
    canReadPicture: async () => true,
    getReadable: async () => completed,
    deleteFile: async () => {
      completed = null;
    },
    cleanupCandidates: async () => [...candidates].map((objectKey) => ({ objectKey })),
    pruneUnusedFiles: async () => {},
    forgetCandidates: async (keys) => {
      forgottenCandidates.push(keys);
      for (const key of keys) candidates.delete(key);
    },
    expiredUploads: async () => [...expiredUploads.values()],
    forgetUploads: async (ids) => {
      forgottenUploads.push(ids);
      for (const uploadId of ids) expiredUploads.delete(uploadId);
    },
  };
  const storage: ObjectStorage = {
    signUpload: async () => ({
      url: "https://s3.test/upload",
      headers: { "Content-Type": upload.contentType },
    }),
    read: async (key) => {
      const bytes = objects.get(key);
      if (!bytes) throw new ObjectNotFoundError("Object not found.");
      return bytes;
    },
    put: async (key, bytes) => {
      objects.set(key, bytes.slice());
    },
    putImmutable: async (key, bytes) => {
      if (!objects.has(key)) objects.set(key, bytes.slice());
    },
    signDownload: async () => "https://s3.test/content",
    removeMany: async (keys) => {
      removedBatches.push(keys);
      for (const key of keys) objects.delete(key);
      return keys;
    },
  };
  const service = createFileService({
    repository,
    storage,
  });
  return {
    id,
    upload,
    objects,
    repository,
    storage,
    service,
    candidates,
    forgottenCandidates,
    forgottenUploads,
    removedBatches,
    expiredUploads,
    scope: { userId: "alice", organizationId: "org" },
  };
}

test("legacy picture bytes require a readable normalized picture, never a generic file", async () => {
  const f = fixture();
  await f.service.completeUpload(f.scope, f.id);
  const generic = await f.service.bytes(f.scope, f.id);
  expect(!generic.success && generic.error.code).toBe("NOT_FOUND");
  const readable = await f.repository.getReadable(f.scope, f.id);
  if (!readable) throw new Error("Expected completed file.");
  readable.purpose = "avatar";
  const picture = await f.service.bytes(f.scope, f.id);
  expect(picture.success && new TextDecoder().decode(picture.data.bytes)).toBe("hello");
  await f.repository.deleteFile(f.scope, f.id);
  const deleted = await f.service.bytes(f.scope, f.id);
  expect(!deleted.success && deleted.error.code).toBe("NOT_FOUND");
});

describe("file workflow", () => {
  test("cleanup acknowledges each successful storage batch with one database write", async () => {
    const f = fixture();
    f.candidates.add("another");
    f.candidates.add("third");
    f.expiredUploads.set("old-upload", { id: "old-upload", temporaryKey: "old-temporary" });
    await f.service.cleanup();
    expect(f.forgottenCandidates).toEqual([["orphan", "another", "third"]]);
    expect(f.forgottenUploads).toEqual([[f.id, "old-upload"]]);
    expect(f.removedBatches).toEqual([
      ["orphan", "another", "third"],
      [f.upload.temporaryKey, "old-temporary"],
    ]);
    expect(f.candidates.size).toBe(0);
    expect(f.expiredUploads.size).toBe(0);
  });

  test("a failed storage deletion keeps failed keys but acknowledges completed deletions", async () => {
    const f = fixture();
    f.candidates.add("failed");
    f.candidates.add("unprocessed");
    f.storage.removeMany = async () => ["orphan"];
    await rejects(f.service.cleanup(), { message: "Storage cleanup did not remove every orphan." });
    expect([...f.candidates]).toEqual(["failed", "unprocessed"]);
    expect(f.forgottenCandidates).toEqual([["orphan"]]);
  });
  test("partial temporary cleanup acknowledges upload IDs only for deleted keys", async () => {
    const f = fixture();
    f.candidates.clear();
    f.expiredUploads.set("failed-upload", { id: "failed-upload", temporaryKey: "failed-key" });
    f.storage.removeMany = async () => [f.upload.temporaryKey];
    await rejects(f.service.cleanup(), {
      message: "Storage cleanup did not remove every temporary object.",
    });
    expect(f.forgottenUploads).toEqual([[f.id]]);
    expect([...f.expiredUploads.keys()]).toEqual(["failed-upload"]);
  });
  test("generic completion verifies bytes and retries cannot replace final content", async () => {
    const f = fixture();
    const first = await f.service.completeUpload(f.scope, f.id);
    expect(first).toEqual({ success: true, data: { fileId: f.id } });
    f.objects.set(f.upload.temporaryKey, new TextEncoder().encode("other"));
    f.upload.expiresAt = new Date(0);
    f.storage.read = async () => {
      throw new Error("Completed replay must not read temporary bytes");
    };
    expect(await f.service.completeUpload(f.scope, f.id)).toEqual(first);
    const { completed: final } = await f.repository.getUpload(
      { userId: "alice", organizationId: "org" },
      f.id,
    );
    expect(new TextDecoder().decode(f.objects.get(final!.objectKey))).toBe("hello");
    expect(final!.size).toBe(5);
    expect(final!.objectKey).not.toBe(f.upload.temporaryKey);
    expect(final!.objectKey).toBe(`objects/organizations/org/file/${f.id}/${final!.sha256}`);
  });

  test("file downloads pass the original filename to the storage adapter", async () => {
    const f = fixture();
    const signDownload = mock(async () => "https://s3.test/content");
    f.storage.signDownload = signDownload;
    f.upload.filename = "résumé (final).txt";
    expect((await f.service.completeUpload(f.scope, f.id)).success).toBe(true);
    const { completed } = await f.repository.getUpload(f.scope, f.id);
    expect(await f.service.content(f.scope, f.id)).toEqual({
      success: true,
      data: { url: "https://s3.test/content" },
    });
    expect(signDownload).toHaveBeenCalledWith(completed!.objectKey, {
      kind: "attachment",
      filename: "résumé (final).txt",
    });
  });

  test("parallel completion converges on one identity", async () => {
    const f = fixture();
    const results = await Promise.all([
      f.service.completeUpload(f.scope, f.id),
      f.service.completeUpload(f.scope, f.id),
    ]);
    expect(results[0]).toEqual({ success: true, data: { fileId: f.id } });
    expect(results[1]).toEqual(results[0]);
    expect(f.objects.size).toBe(2);
  });

  test("size mismatches and expired uploads never finalize", async () => {
    const f = fixture();
    f.upload.size = 10;
    const mismatch = await f.service.completeUpload(f.scope, f.id);
    expect(!mismatch.success && mismatch.error.code).toBe("INVALID_INPUT");
    f.upload.expiresAt = new Date(0);
    const expired = await f.service.completeUpload(f.scope, f.id);
    expect(!expired.success && expired.error.code).toBe("CONFLICT");
    expect(
      (await f.repository.getUpload({ userId: "alice", organizationId: "org" }, f.id)).completed,
    ).toBeNull();
  });

  test("completion before the upload object exists asks the client to retry", async () => {
    const f = fixture();
    f.objects.delete(f.upload.temporaryKey);
    expect(await f.service.completeUpload(f.scope, f.id)).toMatchObject({
      success: false,
      error: { code: "CONFLICT", message: "Upload has not finished. Try again." },
    });
  });

  test("pictures store only normalized pixels", async () => {
    const f = fixture();
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    Object.assign(f.upload, {
      purpose: "avatar",
      ownerUserId: "alice",
      organizationId: null,
      contentType: "image/png",
      size: bytes.length,
    });
    f.objects.set(f.upload.temporaryKey, bytes);
    expect((await f.service.completeUpload(f.scope, f.id)).success).toBe(true);
    const { completed: final } = await f.repository.getUpload(
      { userId: "alice", organizationId: "org" },
      f.id,
    );
    expect(final!.contentType).toBe("image/webp");
    expect(final!.objectKey).toBe(`objects/users/alice/avatar/${f.id}/${final!.sha256}.webp`);
    expect((await sharp(f.objects.get(final!.objectKey)).metadata()).format).toBe("webp");
  });

  test.each(["orphan", "temporary"])(
    "cleanup retains failed %s deletion intent and retries it",
    async (kind) => {
      const f = fixture();
      const key = kind === "orphan" ? "orphan" : f.upload.temporaryKey;
      f.objects.set("orphan", new Uint8Array([1]));
      const remove = f.storage.removeMany.bind(f.storage);
      f.storage.removeMany = async (keys) => {
        if (keys.includes(key)) throw new Error("Storage unavailable");
        return remove(keys);
      };
      await rejects(f.service.cleanup(), { message: "Storage unavailable" });
      expect(f.objects.has(key)).toBe(true);
      expect(kind === "orphan" ? f.candidates.has(key) : f.expiredUploads.has(f.id)).toBe(true);
      f.storage.removeMany = remove;
      await f.service.cleanup();
      expect(f.objects.has("orphan")).toBe(false);
      expect(f.objects.has(f.upload.temporaryKey)).toBe(false);
      expect(f.candidates.size).toBe(0);
      expect(f.expiredUploads.size).toBe(0);
    },
  );
});
