import type { RepositoryContext } from "../../core/repository-context";
import { crmDeals, crmStages } from "./schema";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

export function homeDeals(ctx: RepositoryContext, today: string) {
  return ctx.db
    .select({
      entityId: crmDeals.entityId,
      title: crmDeals.title,
      stage: crmStages.name,
      expectedCloseDate: crmDeals.expectedCloseDate,
    })
    .from(crmDeals)
    .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
    .where(
      and(
        eq(crmDeals.organizationId, ctx.scope.organizationId),
        eq(crmDeals.ownerActorEntityId, ctx.scope.actorEntityId),
        eq(crmDeals.outcome, "open"),
        isNull(crmDeals.archivedAt),
        lte(crmDeals.expectedCloseDate, sql`${today}::date + 7`),
        ctx.readable(crmDeals.entityId),
      ),
    )
    .orderBy(asc(crmDeals.expectedCloseDate), asc(crmDeals.entityId))
    .limit(4);
}
