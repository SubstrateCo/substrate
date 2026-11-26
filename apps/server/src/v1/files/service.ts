import { MAX_FILE_BYTES, type CreateUploadInput } from "@substrate/contracts/files/input";
import { newId } from "@substrate/contracts/ids";
import {
  finalObjectKey,
  type StorageRepository,
  type StorageScope,
} from "@substrate/database/storage";

import { ServiceError, serviceResult } from "../../shared/service-result";
import { ObjectNotFoundError, type ObjectStorage } from "../../storage/types";
import type { ImageCodec } from "./image-codec";
import { normalizePicture } from "./image-policy";
import { createHash } from "node:crypto";

/** How long an upload can be completed after it was created. */
const uploadTtlMs = 15 * 60_000;

export interface FileServiceDependencies {
  repository: StorageRepository;
  storage: ObjectStorage;
  images: ImageCodec;
}

export function createFileService(deps: FileServiceDependencies) {
  const { repository, storage, images } = deps;
  return {
    createUpload(scope: StorageScope, input: CreateUploadInput) {
      return serviceResult(async () => {
        const id = newId();
        const upload = await repository.createUpload(
          scope,
          input,
          id,
          new Date(Date.now() + uploadTtlMs),
        );
        const ticket = await storage.signUpload(upload.temporaryKey, input.contentType, input.size);
        return { uploadId: id, uploadUrl: ticket.url, headers: ticket.headers };
      });
    },
    completeUpload(scope: StorageScope, id: string) {
      return serviceResult(async () => {
        const { upload, completed } = await repository.getUpload(scope, id);
        if (completed) return { fileId: completed.id };
        if (upload.expiresAt <= new Date())
          throw new ServiceError("CONFLICT", "Upload expired. Start a new upload.");
        let bytes: Uint8Array;
        try {
          bytes = await storage.read(upload.temporaryKey, MAX_FILE_BYTES);
        } catch (error) {
          if (error instanceof RangeError)
            throw new ServiceError("PAYLOAD_TOO_LARGE", "File exceeds 5 MB.");
          if (error instanceof ObjectNotFoundError)
            throw new ServiceError("CONFLICT", "Upload has not finished. Try again.");
          throw error;
        }
        if (bytes.length !== upload.size)
          throw new ServiceError(
            "INVALID_INPUT",
            "Uploaded size does not match the declared size.",
          );
        const isPicture = upload.purpose !== "file";
        if (isPicture) bytes = await normalizePicture(images, bytes, upload.contentType);
        if (bytes.length > MAX_FILE_BYTES)
          throw new ServiceError("PAYLOAD_TOO_LARGE", "File exceeds 5 MB.");
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const objectKey = finalObjectKey(upload, sha256);
        const contentType = isPicture ? "image/webp" : upload.contentType;
        // Record intent first. A crash leaves a durable, sweepable orphan, not a leaked object.
        await repository.addCandidate(objectKey);
        await storage.putImmutable(objectKey, bytes, contentType);
        const file = await repository.complete(scope, id, {
          objectKey,
          contentType,
          size: bytes.length,
          sha256,
        });
        // Temporary keys stay writable until the ticket expires. Never use them for content.
        return { fileId: file.id };
      });
    },
    content(scope: StorageScope, id: string) {
      return serviceResult(async () => {
        const file = await repository.getReadable(scope, id);
        if (!file) throw new ServiceError("NOT_FOUND", "File not found or access denied.");
        const url = await storage.signDownload(
          file.objectKey,
          file.purpose === "file"
            ? { kind: "attachment", filename: file.filename }
            : { kind: "inline" },
        );
        return { url };
      });
    },
    bytes(scope: StorageScope, id: string) {
      return serviceResult(async () => {
        const file = await repository.getReadable(scope, id);
        if (!file) throw new ServiceError("NOT_FOUND", "File not found or access denied.");
        // Only normalized managed pictures may render inline through this endpoint.
        if (file.purpose === "file")
          throw new ServiceError("NOT_FOUND", "Picture not found or access denied.");
        try {
          return { bytes: await storage.read(file.objectKey, MAX_FILE_BYTES) };
        } catch (error) {
          if (error instanceof ObjectNotFoundError)
            throw new ServiceError("NOT_FOUND", "Picture not found or access denied.");
          throw error;
        }
      });
    },
    deleteFile(scope: StorageScope, id: string) {
      return serviceResult(async () => {
        await repository.deleteFile(scope, id);
        return { fileId: id };
      });
    },
    async cleanup() {
      // Uploads expire after uploadTtlMs. A full day gives in-flight completions ample time to stop.
      const before = new Date(Date.now() - 24 * 60 * 60_000);
      await repository.pruneUnusedFiles(before);
      const candidates = await repository.cleanupCandidates(before);
      if (candidates.length) {
        const removed = await storage.removeMany(
          candidates.map((candidate) => candidate.objectKey),
        );
        await repository.forgetCandidates(removed);
        if (new Set(removed).size !== candidates.length)
          throw new Error("Storage cleanup did not remove every orphan.");
      }
      const uploads = await repository.expiredUploads(before);
      if (uploads.length) {
        const removed = new Set(
          await storage.removeMany(uploads.map((upload) => upload.temporaryKey)),
        );
        const completed = uploads.filter((upload) => removed.has(upload.temporaryKey));
        await repository.forgetUploads(completed.map((upload) => upload.id));
        if (completed.length !== uploads.length)
          throw new Error("Storage cleanup did not remove every temporary object.");
      }
    },
  };
}

export type FileService = ReturnType<typeof createFileService>;
