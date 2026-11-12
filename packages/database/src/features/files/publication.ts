import { attachmentFileIds } from "@substrate/contracts/files/attachments";

import { actors } from "../../core/actors/schema";
import type { Locked, RepositoryContext } from "../../core/repository-context";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import type { LockedConversation } from "../messaging/access";
import { and, eq, inArray, isNull } from "drizzle-orm";

// The locked destination proves access. The conditional write arbitrates publication and deletion.
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
    .update(storedFiles)
    .set({ publishedAt: new Date() })
    .where(
      and(
        inArray(storedFiles.id, ids),
        eq(storedFiles.organizationId, ctx.scope.organizationId),
        eq(storedFiles.purpose, "file"),
        eq(storedFiles.uploadedBy, actor.userId!),
        isNull(storedFiles.publishedAt),
      ),
    )
    .returning({ id: storedFiles.id });
  if (files.length !== ids.length) throw new AccessDeniedError();
}
