import { isForeignKeyViolation } from "../../errors";
import type { Database } from "../executor";
import { fileUploads, storedFiles, storageCandidates } from "./schema";
import { and, eq, inArray, isNull, lt, not, notExists, sql, type SQL } from "drizzle-orm";

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
      const prune = db.transaction(async (tx) => {
        const unused = () => and(not(fileReferences), lt(storedFiles.createdAt, before));
        const published = sql`coalesce(${storedFiles.publishedAt}, '-infinity'::timestamptz)`;
        const batch = tx
          .select({ id: storedFiles.id, published })
          .from(storedFiles)
          .where(unused())
          .limit(100);
        const deleted = await tx
          .delete(storedFiles)
          .where(and(sql`(${storedFiles.id}, ${published}) IN (${batch})`, unused()))
          .returning();
        if (!deleted.length) return;
        await tx
          .insert(storageCandidates)
          .values(deleted.map((file) => ({ objectKey: file.objectKey })))
          .onConflictDoNothing();
        const ids = deleted.map((file) => file.id);
        await tx
          .update(fileUploads)
          .set({ deletedAt: new Date() })
          .where(inArray(fileUploads.id, ids));
      });
      await prune.catch((error: Error) => {
        if (!isForeignKeyViolation(error)) throw error;
      });
    },
    async forgetCandidates(objectKeys: string[]) {
      if (objectKeys.length)
        await db.delete(storageCandidates).where(inArray(storageCandidates.objectKey, objectKeys));
    },
    async expiredUploads(before: Date) {
      return db
        .select({ id: fileUploads.id, temporaryKey: fileUploads.temporaryKey })
        .from(fileUploads)
        .where(and(lt(fileUploads.expiresAt, before), isNull(fileUploads.temporaryCleanedAt)))
        .limit(100);
    },
    async forgetUploads(ids: string[]) {
      if (ids.length) await db.delete(fileUploads).where(inArray(fileUploads.id, ids));
    },
  };
}
