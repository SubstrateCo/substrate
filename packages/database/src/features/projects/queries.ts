import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { projects } from "./schema";
import { and, asc, isNull } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Checks the active actor in the same statement: an active actor always gets a row, with a null
// project when nothing is readable. Only a page past the end needs a separate check.
export async function queryProjects(
  ctx: RepositoryContext,
  page: { offset?: number; limit?: number } = {},
) {
  const actorEntity = alias(entities, "projects_viewer_entity");
  const query = ctx.db
    .select({ project: projects })
    .from(actors)
    .innerJoin(
      actorEntity,
      and(
        eq(actorEntity.organizationId, actors.organizationId),
        eq(actorEntity.entityId, actors.entityId),
        isNull(actorEntity.deletedAt),
      ),
    )
    .leftJoin(
      projects,
      and(eq(projects.organizationId, actors.organizationId), ctx.readable(projects.entityId)),
    )
    .where(
      and(
        eq(actors.organizationId, ctx.scope.organizationId),
        eq(actors.entityId, ctx.scope.actorEntityId),
        activeActorCondition(),
      ),
    )
    .orderBy(asc(projects.name), asc(projects.entityId))
    .offset(page.offset ?? 0);
  const rows = await (page.limit === undefined ? query : query.limit(page.limit));
  if (!rows.length) {
    if (!page.offset) throw new AccessDeniedError();
    await ctx.requireActiveActor();
  }
  return rows.flatMap((row) => (row.project ? [row.project] : []));
}
