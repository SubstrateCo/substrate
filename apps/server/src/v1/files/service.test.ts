import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import type { ObjectStorage } from "@startup-os/storage";
import type { StorageRepository } from "@startup-os/database/storage";
import { createFileService } from "./service";
import { ServiceError } from "../../shared/service-result";

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
  let completed: Awaited<ReturnType<StorageRepository["getCompleted"]>> = null;
  const objects = new Map<string, Uint8Array>([
    [upload.temporaryKey, new TextEncoder().encode("hello")],
  ]);
  const removed: string[] = [];
  const repository: StorageRepository = {
    createUpload: async () => upload,
    getUpload: async () => upload,
    getCompleted: async () => completed,
    addCandidate: async () => {},
    complete: async (_scope, _id, data) => (completed ??= { ...upload, ...data }),
    validatePicture: async () => {},
    getReadable: async () => completed,
    deleteFile: async () => {
      completed = null;
    },
    cleanupCandidates: async () => [{ objectKey: "orphan" }],
    pruneUnusedFiles: async () => {},
    forgetCandidate: async () => {},
    expiredUploads: async () => [{ id, temporaryKey: upload.temporaryKey }],
    forgetUpload: async () => {},
  };
  const storage: ObjectStorage = {
    signUpload: async () => ({
      url: "https://s3.test/upload",
      headers: { "Content-Type": upload.contentType },
    }),
    read: async (key) => objects.get(key)!,
    putImmutable: async (key, bytes) => {
      if (!objects.has(key)) objects.set(key, bytes.slice());
    },
    signDownload: async (_key, disposition) => `https://s3.test/content?disposition=${disposition}`,
    remove: async (key) => {
      removed.push(key);
      objects.delete(key);
    },
  };
  const service = createFileService({
    repository,
    storage,
    updatePicture: async (_headers, _purpose, fileId) => ({
      fileId,
      url: fileId ? `/api/v1/files/${fileId}/content` : null,
    }),
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
    removed,
    headers: new Headers({ cookie: "session=1", origin: "https://app.test" }),
  };
}

describe("file workflow", () => {
  test("generic completion verifies bytes and retries cannot replace final content", async () => {
    const f = fixture();
    const first = await f.service.completeUpload(f.headers, f.id);
    expect(first).toEqual({ success: true, data: { fileId: f.id } });
    f.objects.set(f.upload.temporaryKey, new TextEncoder().encode("other"));
    expect(await f.service.completeUpload(f.headers, f.id)).toEqual(first);
    const final = await f.repository.getCompleted(f.id);
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
    expect(await f.repository.getCompleted(f.id)).toBeNull();
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
    const final = await f.repository.getCompleted(f.id);
    expect(final!.contentType).toBe("image/webp");
    expect(final!.objectKey).toBe(`objects/users/alice/avatar/${f.id}/${final!.sha256}.webp`);
    expect((await sharp(f.objects.get(final!.objectKey)).metadata()).format).toBe("webp");
  });

  test("mutations require origin and authentication; cleanup retries durable deletions", async () => {
    const f = fixture();
    const origin = await f.service.completeUpload(new Headers({ cookie: "x" }), f.id);
    expect(!origin.success && origin.error.code).toBe("FORBIDDEN");
    const session = await f.service.completeUpload(
      new Headers({ origin: "https://app.test" }),
      f.id,
    );
    expect(!session.success && session.error.code).toBe("UNAUTHENTICATED");
    await f.service.cleanup();
    expect(f.removed).toEqual(["orphan", f.upload.temporaryKey]);
  });
});
