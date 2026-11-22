import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";
import type { CreateUploadInput } from "@substrate/contracts/files/input";
import type { PictureKind } from "@substrate/contracts/files/pictures";

import { AccessDeniedError, ConflictError, violatedConstraint } from "../../errors";
import { userAgents } from "../actors/user-agents.schema";
import type { Database, DatabaseExecutor } from "../executor";
import { member } from "../organizations/schema";
import { createStorageCleanup } from "./cleanup";
import { temporaryObjectKey } from "./object-keys";
import { fileUploads, storedFiles, storageCandidates } from "./schema";
import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  not,
  notExists,
  sql,
  type SQL,
} from "drizzle-orm";

// Trusted server-only identity scope. Personal files deliberately do not require an actor.
export interface StorageScope {
  userId: string;
  organizationId: string | null;
}

async function requireScope(
  db: DatabaseExecutor,
  scope: StorageScope,
  // oxlint-disable-next-line deslop/prefer-literal-union -- Persisted upload purposes are strings; all non-avatar uploads need organization access.
  purpose: string,
  manage = true,
) {
  if (purpose === "avatar") return;
  if (!scope.organizationId) throw new AccessDeniedError();
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, scope.userId), eq(member.organizationId, scope.organizationId)));
  requireMemberRole(purpose, membership?.role ?? null, manage);
}

// The scope's role in its organization, or NULL for a non-member.
function memberRole(scope: StorageScope) {
  if (!scope.organizationId) return sql<string | null>`null`;
  return sql<string | null>`(select ${member.role} from ${member}
    where ${member.userId} = ${scope.userId} and ${member.organizationId} = ${scope.organizationId})`;
}

// oxlint-disable-next-line deslop/prefer-literal-union -- Persisted upload purposes are strings; all non-avatar uploads need organization access.
function requireMemberRole(purpose: string, role: string | null, manage: boolean) {
  if (
    role === null ||
    (manage && purpose === "organization-logo" && !organizationSettingsAccess(role).allowed)
  )
    throw new AccessDeniedError();
}

export function createStorageRepository(
  db: Database,
  fileReferences: SQL = isNotNull(storedFiles.publishedAt),
) {
  return {
    ...createStorageCleanup(db, fileReferences),
    requirePictureAccess(scope: StorageScope, purpose: Exclude<PictureKind, "project-icon">) {
      return requireScope(db, scope, purpose);
    },
    async canReadPicture(
      scope: StorageScope,
      purpose: Exclude<PictureKind, "project-icon">,
      ownerId: string,
    ) {
      if (purpose === "avatar" && ownerId === scope.userId) return true;
      if (!scope.organizationId) return false;
      if (purpose === "organization-logo" && ownerId !== scope.organizationId) return false;
      // An avatar needs both the viewer and its owner in the organization.
      const people = purpose === "avatar" ? [scope.userId, ownerId] : [scope.userId];
      const members = await db
        .select({ userId: member.userId })
        .from(member)
        .where(
          and(inArray(member.userId, people), eq(member.organizationId, scope.organizationId)),
        );
      return people.every((id) => members.some((row) => row.userId === id));
    },
    async createUpload(scope: StorageScope, input: CreateUploadInput, id: string, expiresAt: Date) {
      return db.transaction(async (tx) => {
        if (input.purpose === "file") {
          // Approximate across parallel requests, but shared across the uploader's workspaces.
          const outstanding = await tx
            .select({ id: fileUploads.id })
            .from(fileUploads)
            .where(
              and(
                eq(fileUploads.uploadedBy, scope.userId),
                eq(fileUploads.purpose, "file"),
                gt(fileUploads.expiresAt, new Date()),
                isNull(fileUploads.deletedAt),
                notExists(
                  tx
                    .select({ id: storedFiles.id })
                    .from(storedFiles)
                    .where(eq(storedFiles.id, fileUploads.id)),
                ),
              ),
            )
            .limit(20);
          if (outstanding.length >= 20)
            throw new ConflictError(
              "Too many uploads are in progress. Finish them or try again later.",
            );
        }
        await requireScope(tx, scope, input.purpose);
        const [upload] = await tx
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
      });
    },
    async getUpload(scope: StorageScope, id: string) {
      const [row] = await db
        .select({ upload: fileUploads, completed: storedFiles, role: memberRole(scope) })
        .from(fileUploads)
        .leftJoin(storedFiles, eq(storedFiles.id, fileUploads.id))
        .where(and(eq(fileUploads.id, id), eq(fileUploads.uploadedBy, scope.userId)));
      if (
        !row ||
        (row.upload.organizationId !== null && row.upload.organizationId !== scope.organizationId)
      )
        throw new AccessDeniedError();
      const { upload, completed, role } = row;
      if (upload.purpose !== "avatar") {
        if (!scope.organizationId) throw new AccessDeniedError();
        requireMemberRole(upload.purpose, role, true);
      }
      if (upload.deletedAt) throw new ConflictError("File was deleted. Start a new upload.");
      return { upload, completed };
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
          // Serialize completions with deletion markers and upload cleanup, not key readers.
          // SHARE would let an insert loser wait on a file deletion that waits on this upload.
          .for("no key update");
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
          .onConflictDoNothing({ target: storedFiles.id })
          .returning();
        if (file) return file;
        const [completed] = await tx.select().from(storedFiles).where(eq(storedFiles.id, id));
        return completed!;
      });
    },
    async getReadable(scope: StorageScope, id: string) {
      const [row] = await db
        .select({ file: storedFiles, role: memberRole(scope) })
        .from(storedFiles)
        .where(eq(storedFiles.id, id));
      if (!row) return null;
      const { file } = row;
      if (file.purpose === "avatar") return file.ownerUserId === scope.userId ? file : null;
      if (file.publishedAt) return null;
      if (file.organizationId !== scope.organizationId) return null;
      if (file.uploadedBy !== scope.userId || !scope.organizationId) return null;
      return row.role !== null ? file : null;
    },
    async deleteFile(scope: StorageScope, id: string) {
      await db
        .transaction(async (tx) => {
          const [file] = await tx.select().from(storedFiles).where(eq(storedFiles.id, id));
          if (!file) throw new AccessDeniedError();
          const ownedByOtherUser = file.ownerUserId !== null && file.ownerUserId !== scope.userId;
          const inOtherOrganization =
            file.organizationId !== null && file.organizationId !== scope.organizationId;
          if (file.uploadedBy !== scope.userId || ownedByOtherUser || inOtherOrganization)
            throw new AccessDeniedError();
          await requireScope(tx, scope, file.purpose, false);
          const deleted = await tx
            .delete(storedFiles)
            .where(
              and(
                eq(storedFiles.id, id),
                // Reference subqueries use the statement snapshot. Also detect publication
                // that commits while this delete waits for its conditional row write.
                file.publishedAt === null
                  ? isNull(storedFiles.publishedAt)
                  : eq(storedFiles.publishedAt, file.publishedAt),
                not(fileReferences),
                notExists(
                  tx
                    .select({ id: userAgents.id })
                    .from(userAgents)
                    .where(eq(userAgents.imageFileId, storedFiles.id)),
                ),
              ),
            )
            .returning({ id: storedFiles.id });
          if (!deleted.length)
            throw new ConflictError("Remove the attachment before deleting this file.");
          await tx.update(fileUploads).set({ deletedAt: new Date() }).where(eq(fileUploads.id, id));
          await tx
            .insert(storageCandidates)
            .values({ objectKey: file.objectKey })
            .onConflictDoNothing();
        })
        .catch((error: Error) => {
          if (violatedConstraint(error) === "user_agent_picture_file_owner_fk")
            throw new ConflictError("Remove the attachment before deleting this file.");
          throw error;
        });
    },
  };
}

export type StorageRepository = ReturnType<typeof createStorageRepository>;
