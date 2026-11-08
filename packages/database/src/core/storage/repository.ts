import { organizationSettingsAccess } from "@startup-os/contracts/auth/settings-access";
import type { CreateUploadInput } from "@startup-os/contracts/files/input";

import type { Database, DatabaseExecutor } from "../../client";
import { AccessDeniedError, ConflictError } from "../../errors";
import { userAgents } from "../actors/user-agents.schema";
import { member } from "../organizations/schema";
import { createStorageCleanup } from "./cleanup";
import { temporaryObjectKey } from "./object-keys";
import { fileUploads, storedFiles, storageCandidates } from "./schema";
import { and, eq, sql } from "drizzle-orm";

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
    requirePictureAccess(scope: StorageScope, purpose: "avatar" | "organization-logo") {
      return requireScope(db, scope, purpose);
    },
    async canReadPicture(
      scope: StorageScope,
      purpose: "avatar" | "organization-logo",
      ownerId: string,
    ) {
      if (purpose === "avatar" && ownerId === scope.userId) return true;
      if (!scope.organizationId) return false;
      const [viewer] = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(eq(member.userId, scope.userId), eq(member.organizationId, scope.organizationId)),
        );
      if (!viewer) return false;
      if (purpose === "organization-logo") return ownerId === scope.organizationId;
      const [owner] = await db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.userId, ownerId), eq(member.organizationId, scope.organizationId)));
      return !!owner;
    },
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
    async getReadable(scope: StorageScope, id: string) {
      const [file] = await db.select().from(storedFiles).where(eq(storedFiles.id, id));
      if (!file) return null;
      if (file.purpose === "avatar") return file.ownerUserId === scope.userId ? file : null;
      if (file.organizationId !== scope.organizationId) return null;
      try {
        await requireScope(db, scope, file.purpose, false);
      } catch (error) {
        if (error instanceof AccessDeniedError) return null;
        throw error;
      }
      if (file.uploadedBy === scope.userId) return file;
      return null;
    },
    async deleteFile(scope: StorageScope, id: string) {
      await db.transaction(async (tx) => {
        const [file] = await tx
          .select()
          .from(storedFiles)
          .where(eq(storedFiles.id, id))
          .for("update");
        if (!file) throw new AccessDeniedError();
        const ownedByOtherUser = file.ownerUserId !== null && file.ownerUserId !== scope.userId;
        const inOtherOrganization =
          file.organizationId !== null && file.organizationId !== scope.organizationId;
        if (file.uploadedBy !== scope.userId || ownedByOtherUser || inOtherOrganization)
          throw new AccessDeniedError();
        await requireScope(tx, scope, file.purpose, false);
        const [usage] = await tx.execute<{ referenced: boolean }>(sql`
          SELECT EXISTS (SELECT 1 FROM ${userAgents} WHERE ${userAgents.imageFileId} = ${id})
            AS referenced
        `);
        if (usage?.referenced)
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
