import type { StorageRepository } from "@startup-os/database/storage";

import { ServiceError } from "../../shared/service-result";
import type { ObjectStorage } from "../../storage/types";
import { createFileService } from "./service";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
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
    forgetCandidate: async (key) => {
      candidates.delete(key);
    },
    expiredUploads: async () => [...expiredUploads.values()],
    forgetUpload: async (uploadId) => {
      expiredUploads.delete(uploadId);
    },
  };
  const storage: ObjectStorage = {
    signUpload: async () => ({
      url: "https://s3.test/upload",
      headers: { "Content-Type": upload.contentType },
    }),
    read: async (key) => objects.get(key)!,
    put: async (key, bytes) => {
      objects.set(key, bytes.slice());
    },
    putImmutable: async (key, bytes) => {
      if (!objects.has(key)) objects.set(key, bytes.slice());
    },
    signDownload: async (_key, disposition) => `https://s3.test/content?disposition=${disposition}`,
    remove: async (key) => {
      objects.delete(key);
    },
  };
  const service = createFileService({
    repository,
    storage,
    authenticate: async (headers) => {
      if (!headers.has("cookie")) throw new ServiceError("UNAUTHENTICATED", "Sign in.");
      return { userId: "alice", organizationId: "org" };
    },
    requireOrigin: (headers) => {
      if (headers.get("origin") !== "https://app.test")
        throw new ServiceError("FORBIDDEN", "Invalid origin.");
    },
  });
  return {
    id,
    upload,
    objects,
    repository,
    storage,
    service,
    candidates,
    expiredUploads,
    headers: new Headers({ cookie: "session=1", origin: "https://app.test" }),
  };
}

describe("file workflow", () => {
  test("generic completion verifies bytes and retries cannot replace final content", async () => {
    const f = fixture();
    const first = await f.service.completeUpload(f.headers, f.id);
    expect(first).toEqual({ success: true, data: { fileId: f.id } });
    f.objects.set(f.upload.temporaryKey, new TextEncoder().encode("other"));
    f.upload.expiresAt = new Date(0);
    f.storage.read = async () => {
      throw new Error("Completed replay must not read temporary bytes");
    };
    expect(await f.service.completeUpload(f.headers, f.id)).toEqual(first);
    const { completed: final } = await f.repository.getUpload(
      { userId: "alice", organizationId: "org" },
      f.id,
    );
    expect(new TextDecoder().decode(f.objects.get(final!.objectKey))).toBe("hello");
    expect(final!.size).toBe(5);
    expect(final!.objectKey).not.toBe(f.upload.temporaryKey);
    expect(final!.objectKey).toBe(`objects/organizations/org/file/${f.id}/${final!.sha256}`);
    const content = await f.service.content(f.headers, f.id);
    expect(content.success && content.data.url).toContain("attachment;");
  });

  test("parallel completion converges on one identity", async () => {
    const f = fixture();
    const results = await Promise.all([
      f.service.completeUpload(f.headers, f.id),
      f.service.completeUpload(f.headers, f.id),
    ]);
    expect(results[0]).toEqual({ success: true, data: { fileId: f.id } });
    expect(results[1]).toEqual(results[0]);
    expect(f.objects.size).toBe(2);
  });

  test("size mismatches and expired uploads never finalize", async () => {
    const f = fixture();
    f.upload.size = 10;
    const mismatch = await f.service.completeUpload(f.headers, f.id);
    expect(!mismatch.success && mismatch.error.code).toBe("INVALID_INPUT");
    f.upload.expiresAt = new Date(0);
    const expired = await f.service.completeUpload(f.headers, f.id);
    expect(!expired.success && expired.error.code).toBe("CONFLICT");
    expect(
      (await f.repository.getUpload({ userId: "alice", organizationId: "org" }, f.id)).completed,
    ).toBeNull();
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
    expect((await f.service.completeUpload(f.headers, f.id)).success).toBe(true);
    const { completed: final } = await f.repository.getUpload(
      { userId: "alice", organizationId: "org" },
      f.id,
    );
    expect(final!.contentType).toBe("image/webp");
    expect(final!.objectKey).toBe(`objects/users/alice/avatar/${f.id}/${final!.sha256}.webp`);
    expect((await sharp(f.objects.get(final!.objectKey)).metadata()).format).toBe("webp");
  });

  test("mutations require origin and authentication", async () => {
    const f = fixture();
    const origin = await f.service.completeUpload(new Headers({ cookie: "x" }), f.id);
    expect(!origin.success && origin.error.code).toBe("FORBIDDEN");
    const session = await f.service.completeUpload(
      new Headers({ origin: "https://app.test" }),
      f.id,
    );
    expect(!session.success && session.error.code).toBe("UNAUTHENTICATED");
  });

  test.each(["orphan", "temporary"])(
    "cleanup retains failed %s deletion intent and retries it",
    async (kind) => {
      const f = fixture();
      const key = kind === "orphan" ? "orphan" : f.upload.temporaryKey;
      f.objects.set("orphan", new Uint8Array([1]));
      const remove = f.storage.remove.bind(f.storage);
      f.storage.remove = async (objectKey) => {
        if (objectKey === key) throw new Error("Storage unavailable");
        await remove(objectKey);
      };
      await expect(f.service.cleanup()).rejects.toThrow("Storage unavailable");
      expect(f.objects.has(key)).toBe(true);
      expect(kind === "orphan" ? f.candidates.has(key) : f.expiredUploads.has(f.id)).toBe(true);
      f.storage.remove = remove;
      await f.service.cleanup();
      expect(f.objects.has("orphan")).toBe(false);
      expect(f.objects.has(f.upload.temporaryKey)).toBe(false);
      expect(f.candidates.size).toBe(0);
      expect(f.expiredUploads.size).toBe(0);
    },
  );
});
