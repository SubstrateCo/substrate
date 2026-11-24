import { realtimeKeys } from "@substrate/contracts/realtime";

import { permissionActorEntityId } from "../../core/actors/access";
import { requireAppEnabled } from "../../core/apps/access";
import { entities } from "../../core/entities/schema";
import type { AuthorizedAccess, RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { meetingArchives } from "./schema";
import { and, eq, sql } from "drizzle-orm";

export function ownedArchives(ctx: RepositoryContext) {
  return ctx.db
    .select({ id: meetingArchives.id })
    .from(meetingArchives)
    .where(
      and(
        eq(meetingArchives.org, ctx.scope.organizationId),
        eq(meetingArchives.owner, permissionActorEntityId(ctx.scope)),
        ctx.readable(meetingArchives.id),
      ),
    );
}

/** Called inside the repository transaction. A read of an empty archive creates nothing. */
export async function archiveForWrite(ctx: RepositoryContext, create = false) {
  await requireAppEnabled(ctx, "meetings");
  const org = ctx.scope.organizationId;
  let [archive] = await ownedArchives(ctx);
  if (!archive && create) {
    const entity = await ctx.createEntity("meeting_archive");
    [archive] = await ctx.db
      .insert(meetingArchives)
      .values({
        id: entity.entityId,
        org,
        type: "meeting_archive",
        owner: permissionActorEntityId(ctx.scope),
      })
      .onConflictDoNothing({ target: [meetingArchives.org, meetingArchives.owner] })
      .returning({ id: meetingArchives.id });
    if (!archive) {
      // Two devices can make the first import simultaneously. Keep just the winning container.
      await ctx.db.delete(entities).where(eq(entities.entityId, entity.entityId));
      [archive] = await ownedArchives(ctx);
    }
  }
  if (!archive) throw new AccessDeniedError();
  const access = await ctx.requireAccess(archive.id, "edit");
  return { ctx, org, id: archive.id, access };
}

export type WritableArchive = {
  ctx: RepositoryContext;
  org: string;
  id: string;
  access: AuthorizedAccess<"edit">;
};

export async function advanceArchive({ ctx, id }: WritableArchive) {
  const [archive] = await ctx.db
    .update(meetingArchives)
    .set({ revision: sql`${meetingArchives.revision}+1` })
    .where(eq(meetingArchives.id, id))
    .returning({ owner: meetingArchives.owner });
  if (!archive) throw new AccessDeniedError();
  ctx.effects.hint({
    audience: realtimeKeys.actor(ctx.scope.organizationId, archive.owner),
    domain: "meetings",
  });
}
