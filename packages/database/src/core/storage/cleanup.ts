import type { Database } from "../../client";
import { userAgents } from "../actors/user-agents.schema";
import { fileUploads, storedFiles, storageCandidates } from "./schema";
import { and, eq, inArray, isNull, lt, not, notExists, type SQL } from "drizzle-orm";

export function createStorageCleanup(db: Database, fileReferences: SQL) {
  return {
    async cleanupCandidates(before: Date) {
      return db
        .select({ objectKey: storageCandidates.objectKey })
        .from(storageCandidates)
        .where(
          and(
            lt(storageCandidates.createdAt, before),
            notExists(
              db
                .select({ id: storedFiles.id })
                .from(storedFiles)
                .where(eq(storedFiles.objectKey, storageCandidates.objectKey)),
            ),
          ),
        )
        .limit(100);
    },
    async pruneUnusedFiles(before: Date) {
      await db.transaction(async (tx) => {
        const unused = await tx
          .select()
          .from(storedFiles)
          .where(
            and(
              not(fileReferences),
              lt(storedFiles.createdAt, before),
              notExists(
                tx
                  .select({ id: userAgents.id })
                  .from(userAgents)
                  .where(eq(userAgents.imageFileId, storedFiles.id)),
              ),
            ),
          )
          .limit(100)
          .for("update", { skipLocked: true });
        if (!unused.length) return;
        await tx
          .insert(storageCandidates)
          .values(unused.map((file) => ({ objectKey: file.objectKey })))
          .onConflictDoNothing();
        const ids = unused.map((file) => file.id);
        await tx
          .update(fileUploads)
          .set({ deletedAt: new Date() })
          .where(inArray(fileUploads.id, ids));
        await tx.delete(storedFiles).where(inArray(storedFiles.id, ids));
      });
    },
    async forgetCandidate(objectKey: string) {
      await db.delete(storageCandidates).where(eq(storageCandidates.objectKey, objectKey));
    },
    async expiredUploads(before: Date) {
      return db
        .select({ id: fileUploads.id, temporaryKey: fileUploads.temporaryKey })
        .from(fileUploads)
        .where(and(lt(fileUploads.expiresAt, before), isNull(fileUploads.temporaryCleanedAt)))
        .limit(100);
    },
    // Cleanup reaches an upload a day after it expired, so it is complete or abandoned. A stored
    // file keeps its own row, and the row's deletion message is no longer needed.
    async forgetUpload(id: string) {
      await db.delete(fileUploads).where(eq(fileUploads.id, id));
    },
  };
}
