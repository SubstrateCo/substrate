import { organizationSettingsAccess } from "@startup-os/contracts/auth/settings-access";
import type { CreateUploadInput } from "@startup-os/contracts/files/input";

import type { Database, DatabaseExecutor } from "../../client";
import { AccessDeniedError, ConflictError } from "../../errors";
import { userAgents } from "../actors/user-agents.schema";
import { member } from "../organizations/schema";
import { createStorageCleanup } from "./cleanup";
import { temporaryObjectKey } from "./object-keys";
import {
  fileUploads,
  storedFiles,
  storageCandidates,
  userPictures,
  organizationPictures,
} from "./schema";
import { and, eq, inArray } from "drizzle-orm";

// Trusted server-only identity scope. Personal files deliberately do not require an actor.
export interface StorageScope {
  userId: string;
  organizationId: string | null;
}

async function requireScope(
  db: DatabaseExecutor,
  scope: StorageScope,
  purpose: string,
  manage = true,
) {
  if (purpose === "avatar") return;
  if (!scope.organizationId) throw new AccessDeniedError();
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, scope.userId), eq(member.organizationId, scope.organizationId)));
  if (
    !membership ||
    (manage &&
      purpose === "organization-logo" &&
      !organizationSettingsAccess(membership.role).allowed)
  )
    throw new AccessDeniedError();
}

export function createStorageRepository(db: Database) {
  return {
    ...createStorageCleanup(db),
    async createUpload(scope: StorageScope, input: CreateUploadInput, id: string, expiresAt: Date) {
      await requireScope(db, scope, input.purpose);
      const [upload] = await db
        .insert(fileUploads)
        .values({
          purpose: input.purpose,
          filename: input.filename,
          contentType: input.contentType,
          size: input.size,
          id,
          uploadedBy: scope.userId,
          ownerUserId: input.purpose === "avatar" ? scope.userId : null,
          organizationId: input.purpose === "avatar" ? null : scope.organizationId,
          temporaryKey: temporaryObjectKey({
            id,
            purpose: input.purpose,
            ownerUserId: input.purpose === "avatar" ? scope.userId : null,
            organizationId: input.purpose === "avatar" ? null : scope.organizationId,
          }),
          expiresAt,
        })
        .returning();
      return upload!;
    },
    async getUpload(scope: StorageScope, id: string) {
      const [result] = await db
        .select({ upload: fileUploads, completed: storedFiles })
        .from(fileUploads)
        .leftJoin(storedFiles, eq(storedFiles.id, fileUploads.id))
        .where(and(eq(fileUploads.id, id), eq(fileUploads.uploadedBy, scope.userId)));
      if (
        !result ||
        (result.upload.organizationId !== null &&
          result.upload.organizationId !== scope.organizationId)
      )
        throw new AccessDeniedError();
      const { upload } = result;
      await requireScope(db, scope, upload.purpose);
      if (upload.deletedAt) throw new ConflictError("File was deleted. Start a new upload.");
      return result;
    },
    async addCandidate(key: string) {
      await db.insert(storageCandidates).values({ objectKey: key }).onConflictDoNothing();
    },
    async complete(
      scope: StorageScope,
      id: string,
      verified: { objectKey: string; contentType: string; size: number; sha256: string },
    ) {
      return db.transaction(async (tx) => {
        const [upload] = await tx
          .select()
          .from(fileUploads)
          .where(eq(fileUploads.id, id))
          .for("update");
        if (
          !upload ||
          upload.uploadedBy !== scope.userId ||
          (upload.organizationId !== null && upload.organizationId !== scope.organizationId)
        )
          throw new AccessDeniedError();
        await requireScope(tx, scope, upload.purpose);
        if (upload.deletedAt) throw new ConflictError("File was deleted. Start a new upload.");
        const [existing] = await tx.select().from(storedFiles).where(eq(storedFiles.id, id));
        if (existing) return existing;
        if (upload.expiresAt <= new Date())
          throw new ConflictError("Upload expired. Start a new upload.");
        const [file] = await tx
          .insert(storedFiles)
          .values({
            id,
            uploadedBy: upload.uploadedBy,
            ownerUserId: upload.ownerUserId,
            organizationId: upload.organizationId,
            purpose: upload.purpose,
            filename: upload.filename,
            objectKey: verified.objectKey,
            contentType: verified.contentType,
            size: verified.size,
            sha256: verified.sha256,
          })
          .returning();
        return file!;
      });
    },
    async validatePicture(
      scope: StorageScope,
      purpose: "avatar" | "organization-logo",
      fileId: string | null,
    ) {
      await requireScope(db, scope, purpose);
      if (fileId) {
        const [file] = await db.select().from(storedFiles).where(eq(storedFiles.id, fileId));
        if (
          !file ||
          file.purpose !== purpose ||
          (purpose === "avatar"
            ? file.ownerUserId !== scope.userId
            : file.organizationId !== scope.organizationId)
        )
          throw new AccessDeniedError();
      }
    },
    async getReadable(scope: StorageScope, id: string) {
      const [file] = await db.select().from(storedFiles).where(eq(storedFiles.id, id));
      if (!file) return null;
      if (file.purpose === "avatar") {
        if (file.ownerUserId === scope.userId) return file;
        const [picture] = await db.select().from(userPictures).where(eq(userPictures.fileId, id));
        if (!picture || !scope.organizationId) return null;
        const shared = await db
          .select({ userId: member.userId })
          .from(member)
          .where(
            and(
              eq(member.organizationId, scope.organizationId),
              inArray(member.userId, [scope.userId, picture.userId]),
            ),
          );
        return shared.length === 2 ? file : null;
      }
      if (file.organizationId !== scope.organizationId) return null;
      try {
        await requireScope(db, scope, file.purpose, false);
      } catch (error) {
        if (error instanceof AccessDeniedError) return null;
        throw error;
      }
      if (file.uploadedBy === scope.userId) return file;
      if (file.purpose === "organization-logo") {
        const [picture] = await db
          .select()
          .from(organizationPictures)
          .where(
            and(
              eq(organizationPictures.organizationId, scope.organizationId!),
              eq(organizationPictures.fileId, id),
            ),
          );
        if (picture) return file;
      }
      return null;
    },
    async deleteFile(scope: StorageScope, id: string) {
      await db.transaction(async (tx) => {
        const [file] = await tx
          .select()
          .from(storedFiles)
          .where(eq(storedFiles.id, id))
          .for("update");
        if (
          !file ||
          file.uploadedBy !== scope.userId ||
          (file.ownerUserId !== null && file.ownerUserId !== scope.userId) ||
          (file.organizationId !== null && file.organizationId !== scope.organizationId)
        )
          throw new AccessDeniedError();
        await requireScope(tx, scope, file.purpose, false);
        const [avatar] = await tx
          .select({ id: userPictures.id })
          .from(userPictures)
          .where(eq(userPictures.fileId, id));
        const [logo] = await tx
          .select({ id: organizationPictures.id })
          .from(organizationPictures)
          .where(eq(organizationPictures.fileId, id));
        const [agent] = await tx
          .select({ id: userAgents.id })
          .from(userAgents)
          .where(eq(userAgents.imageFileId, id));
        if (avatar || logo || agent)
          throw new ConflictError("Remove the picture before deleting this file.");
        await tx
          .insert(storageCandidates)
          .values({ objectKey: file.objectKey })
          .onConflictDoNothing();
        await tx.delete(storedFiles).where(eq(storedFiles.id, id));
        await tx.update(fileUploads).set({ deletedAt: new Date() }).where(eq(fileUploads.id, id));
      });
    },
  };
}

export type StorageRepository = ReturnType<typeof createStorageRepository>;
