import { attachmentFileIds } from "@substrate/contracts/files/attachments";

import { actors } from "../../core/actors/schema";
import type { Authorized, RepositoryContext } from "../../core/repository-context";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import type { Conversation } from "../messaging/access";
import { and, eq, inArray, isNull } from "drizzle-orm";

// The checked destination proves access. The conditional write arbitrates publication and deletion.
export async function publishFiles(
  ctx: RepositoryContext,
  _destination: Authorized<unknown, "edit"> | Conversation,
  ids: string[],
) {
  if (!attachmentFileIds.safeParse(ids).success)
    throw new ValidationError("Select up to 10 distinct files.");
  if (!ids.length) return;
  // A missing or non-human actor yields NULL, which matches no file.
  const uploader = ctx.db
    .select({ userId: actors.userId })
    .from(actors)
    .where(
      and(
        eq(actors.organizationId, ctx.scope.organizationId),
        eq(actors.entityId, ctx.scope.actorEntityId),
        eq(actors.type, "human"),
      ),
    );
  const files = await ctx.db
    .update(storedFiles)
    .set({ publishedAt: new Date() })
    .where(
      and(
        inArray(storedFiles.id, ids),
        eq(storedFiles.organizationId, ctx.scope.organizationId),
        eq(storedFiles.purpose, "file"),
        eq(storedFiles.uploadedBy, uploader),
        isNull(storedFiles.publishedAt),
      ),
    )
    .returning({ id: storedFiles.id });
  if (files.length !== ids.length) throw new AccessDeniedError();
}
