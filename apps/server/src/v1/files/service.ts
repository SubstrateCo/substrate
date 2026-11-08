import { MAX_FILE_BYTES, type CreateUploadInput } from "@startup-os/contracts/files/input";
import {
  finalObjectKey,
  type StorageRepository,
  type StorageScope,
} from "@startup-os/database/storage";

import { ServiceError, serviceResult } from "../../shared/service-result";
import type { ObjectStorage } from "../../storage/types";
import { normalizePicture } from "./image";
import { createHash } from "node:crypto";

export interface FileServiceDependencies {
  repository: StorageRepository;
  storage: ObjectStorage;
  authenticate(headers: Headers): Promise<StorageScope>;
  requireOrigin(headers: Headers): void;
  updatePicture(
    headers: Headers,
    purpose: "avatar" | "organization-logo",
    fileId: string | null,
  ): Promise<{ fileId: string | null; url: string | null }>;
}

export function createFileService(deps: FileServiceDependencies) {
  const { repository, storage } = deps;
  const mutationScope = async (headers: Headers) => {
    deps.requireOrigin(headers);
    return deps.authenticate(headers);
  };
  return {
    createUpload(headers: Headers, input: CreateUploadInput) {
      return serviceResult(async () => {
        const scope = await mutationScope(headers);
        const id = crypto.randomUUID();
        const upload = await repository.createUpload(
          scope,
          input,
          id,
          new Date(Date.now() + 15 * 60_000),
        );
        const ticket = await storage.signUpload(upload.temporaryKey, input.contentType, input.size);
        return { uploadId: id, uploadUrl: ticket.url, headers: ticket.headers };
      });
    },
    completeUpload(headers: Headers, id: string) {
      return serviceResult(async () => {
        const scope = await mutationScope(headers);
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
          if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name))
            throw new ServiceError("CONFLICT", "Upload has not finished. Try again.");
          throw error;
        }
        if (bytes.length !== upload.size)
          throw new ServiceError(
            "INVALID_INPUT",
            "Uploaded size does not match the declared size.",
          );
        const isPicture = upload.purpose !== "file";
        if (isPicture) bytes = await normalizePicture(bytes, upload.contentType);
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
    setPicture(headers: Headers, purpose: "avatar" | "organization-logo", fileId: string | null) {
      return serviceResult(async () => {
        await mutationScope(headers);
        return deps.updatePicture(headers, purpose, fileId);
      });
    },
    content(headers: Headers, id: string) {
      return serviceResult(async () => {
        const file = await repository.getReadable(await deps.authenticate(headers), id);
        if (!file) throw new ServiceError("NOT_FOUND", "File not found or access denied.");
        const disposition =
          file.purpose === "file"
            ? `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
            : "inline";
        return { url: await storage.signDownload(file.objectKey, disposition) };
      });
    },
    deleteFile(headers: Headers, id: string) {
      return serviceResult(async () => {
        await repository.deleteFile(await mutationScope(headers), id);
        return { fileId: id };
      });
    },
    async cleanup() {
      // Uploads expire in 15 minutes. A full day gives in-flight completions ample time to stop.
      const before = new Date(Date.now() - 24 * 60 * 60_000);
      await repository.pruneUnusedFiles(before);
      for (const candidate of await repository.cleanupCandidates(before)) {
        await storage.remove(candidate.objectKey);
        await repository.forgetCandidate(candidate.objectKey);
      }
      for (const upload of await repository.expiredUploads(before)) {
        await storage.remove(upload.temporaryKey);
        await repository.forgetUpload(upload.id);
      }
    },
  };
}

export type FileService = ReturnType<typeof createFileService>;
