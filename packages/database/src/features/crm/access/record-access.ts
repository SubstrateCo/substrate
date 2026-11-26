import type { DealOutcome, RecordArchiveFilter } from "@substrate/contracts/crm/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import {
  activeActorCondition,
  permissionActorEntityId,
  viewerActorJoins,
} from "../../../core/actors/access";
import { actors } from "../../../core/actors/schema";
import { entities } from "../../../core/entities/schema";
import { RepositoryContext, entityCursor } from "../../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../../errors";
import { crmAccounts, crmDeals } from "../schema";
import { and, eq, gt, ilike, isNull, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export type ListOptions = {
  limit?: number;
  afterEntityId?: string;
  search?: string;
  archived?: RecordArchiveFilter;
  /** Deals only. */
  outcome?: DealOutcome;
};

export const archivedRecordMessage = "Restore the archived record first.";

/** Rejects a structural change to an archived account or deal. Check access first. */
export async function requireUnarchivedRecord(
  ctx: RepositoryContext,
  entity: { entityId: string; entityType: string },
) {
  const table = entity.entityType === "deal" ? crmDeals : crmAccounts;
  const [row] = await ctx.db
    .select({ archivedAt: table.archivedAt })
    .from(table)
    .where(
      and(eq(table.organizationId, ctx.scope.organizationId), eq(table.entityId, entity.entityId)),
    );
  if (row?.archivedAt) throw new ValidationError(archivedRecordMessage);
}

export function crmRecordAccess(context: RepositoryContext) {
  const { scope } = context;
  const org = scope.organizationId;
  function changed(ctx: RepositoryContext, id: string) {
    ctx.effects.hint({ audience: realtimeKeys.entity(org, id), domain: "context" });
  }
  const target = (table: typeof crmAccounts | typeof crmDeals, id: string) =>
    and(eq(table.organizationId, org), eq(table.entityId, id));
  function requireType(ctx: RepositoryContext, id: string, type: "account" | "deal", edit = false) {
    return ctx.requireAccess(id, edit ? "edit" : "view", { type });
  }
  async function owner(ctx: RepositoryContext) {
    const viewer = viewerActorJoins(ctx.scope, "crm_creator_entity");
    const responsible = alias(actors, "crm_responsible_actor");
    const responsibleEntity = alias(entities, "crm_responsible_entity");
    const [actor] = await ctx.db
      .select({ entityId: responsible.entityId, type: responsible.type })
      .from(actors)
      .innerJoin(viewer.entity, viewer.entityOn)
      .innerJoin(
        responsible,
        and(
          eq(responsible.organizationId, org),
          eq(responsible.entityId, permissionActorEntityId(ctx.scope)),
          activeActorCondition(responsible),
        ),
      )
      .innerJoin(
        responsibleEntity,
        and(
          eq(responsibleEntity.organizationId, responsible.organizationId),
          eq(responsibleEntity.entityId, responsible.entityId),
          isNull(responsibleEntity.deletedAt),
        ),
      )
      .where(and(viewer.actorOn, activeActorCondition()));
    if (!actor) throw new AccessDeniedError();
    if (actor.type !== "human")
      throw new ValidationError("CRM records require a human responsible owner.");
    return actor.entityId;
  }
  function listWhere(table: typeof crmAccounts | typeof crmDeals, options: ListOptions) {
    const afterEntityId = entityCursor(options.afterEntityId);
    let archiveFilter;
    if (options.archived !== "all")
      archiveFilter =
        options.archived === "archived" ? isNotNull(table.archivedAt) : isNull(table.archivedAt);
    return and(
      eq(table.organizationId, org),
      context.readable(table.entityId),
      afterEntityId ? gt(table.entityId, afterEntityId) : undefined,
      archiveFilter,
      options.search
        ? ilike(
            "name" in table ? table.name : table.title,
            `%${options.search.replace(/[\\%_]/g, "\\$&")}%`,
          )
        : undefined,
    );
  }
  return { changed, target, requireType, owner, listWhere };
}
