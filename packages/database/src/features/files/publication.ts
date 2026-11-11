import { attachmentFileIds } from "@substrate/contracts/files/attachments";

import { actors } from "../../core/actors/schema";
import type { Locked, RepositoryContext } from "../../core/repository-context";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import type { LockedConversation } from "../messaging/access";
import { and, eq, inArray } from "drizzle-orm";

// The locked destination proves its access lock. File locks serialize publication with deletion.
export async function publishFiles(
  ctx: RepositoryContext,
  _destination: Locked<unknown, "edit"> | LockedConversation,
  ids: string[],
) {
  if (!attachmentFileIds.safeParse(ids).success)
    throw new ValidationError("Select up to 10 distinct files.");
  if (!ids.length) return;
  const [actor] = await ctx.db
    .select({ userId: actors.userId, type: actors.type })
    .from(actors)
    .where(
      and(
        eq(actors.organizationId, ctx.scope.organizationId),
        eq(actors.entityId, ctx.scope.actorEntityId),
      ),
    );
  if (!actor || actor.type !== "human") throw new AccessDeniedError();
  const files = await ctx.db
    .select()
    .from(storedFiles)
    .where(inArray(storedFiles.id, ids))
    .orderBy(storedFiles.id)
    .for("update");
  if (
    files.length !== ids.length ||
    files.some(
      (file) =>
        file.organizationId !== ctx.scope.organizationId ||
        file.purpose !== "file" ||
        file.uploadedBy !== actor.userId ||
        file.publishedAt !== null,
    )
  )
    throw new AccessDeniedError();
  await ctx.db
    .update(storedFiles)
    .set({ publishedAt: new Date() })
    .where(inArray(storedFiles.id, ids));
}
