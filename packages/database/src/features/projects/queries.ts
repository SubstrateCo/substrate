import type { RecordArchiveFilter } from "@substrate/contracts/crm/input";

import type { PermissionLevel, RepositoryContext } from "../../core/repository-context";
import { projects } from "./schema";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";

export async function queryProjects(
  ctx: RepositoryContext,
  page: { offset?: number; limit?: number } = {},
  archived: RecordArchiveFilter = "active",
) {
  const archiveFilter = {
    active: isNull(projects.archivedAt),
    archived: isNotNull(projects.archivedAt),
    all: undefined,
  }[archived];
  const level =
    archived === "active"
      ? sql<PermissionLevel | null>`null::permission_level`
      : sql<PermissionLevel | null>`${ctx.accessLevel(projects.entityId)}`;
  const query = ctx.db
    .select({ project: projects, level })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, ctx.scope.organizationId),
        ctx.readable(projects.entityId, "view", "project"),
        archiveFilter,
      ),
    )
    .orderBy(asc(projects.name), asc(projects.entityId))
    .offset(page.offset ?? 0);
  const rows = await (page.limit === undefined ? query : query.limit(page.limit));
  return rows.map((row) => ({
    ...row.project,
    ...(archived !== "active" && { level: row.level ?? undefined }),
  }));
}
