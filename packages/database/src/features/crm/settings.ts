import { realtimeKeys } from "@substrate/contracts/realtime";

import { activeActorCondition, permissionActorEntityId } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { requireAppEnabled, requireAppEnabledForActiveActor } from "../../core/apps/access";
import { entities } from "../../core/entities/schema";
import { adminRoleCondition } from "../../core/organizations/roles";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { crmSettings } from "./settings.schema";
import { and, eq, exists, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export function requireCrmAdmin(context: RepositoryContext) {
  return requireAdminActor(context, permissionActorEntityId(context.scope));
}

/** Requires the scope's own actor to be a human admin; an owner's agent is refused. */
export function requireHumanCrmAdmin(context: RepositoryContext) {
  return requireAdminActor(context, context.scope.actorEntityId);
}

async function requireAdminActor(context: RepositoryContext, actorEntityId: string | SQL) {
  await requireAppEnabled(context, "crm");
  // The same check as context.requireActiveActor(), in the admin query.
  const scopeActor = alias(actors, "crm_scope_actor");
  const scopeEntity = alias(entities, "crm_scope_entity");
  const activeScopeActor = context.db
    .select({ one: sql`1` })
    .from(scopeActor)
    .innerJoin(
      scopeEntity,
      and(
        eq(scopeEntity.entityId, scopeActor.entityId),
        eq(scopeEntity.organizationId, scopeActor.organizationId),
      ),
    )
    .where(
      and(
        eq(scopeActor.organizationId, context.scope.organizationId),
        eq(scopeActor.entityId, context.scope.actorEntityId),
        activeActorCondition(scopeActor),
        isNull(scopeEntity.deletedAt),
      ),
    );
  const [admin] = await context.db
    .select({ id: actors.entityId })
    .from(actors)
    .innerJoin(
      member,
      and(eq(member.organizationId, actors.organizationId), eq(member.userId, actors.userId)),
    )
    .where(
      and(
        eq(actors.organizationId, context.scope.organizationId),
        eq(actors.entityId, actorEntityId),
        eq(actors.type, "human"),
        adminRoleCondition(member.role),
        exists(activeScopeActor),
      ),
    );
  if (!admin) throw new AccessDeniedError();
}
// pipelineVersion is internal to pipeline changes. This write must not reset it.
const publicSettings = {
  organizationId: crmSettings.organizationId,
  defaultCurrency: crmSettings.defaultCurrency,
};
export function settingsRepository(context: RepositoryContext) {
  return {
    async settings() {
      await requireAppEnabledForActiveActor(context, "crm");
      const [row] = await context.db
        .select(publicSettings)
        .from(crmSettings)
        .where(eq(crmSettings.organizationId, context.scope.organizationId));
      return row ?? { organizationId: context.scope.organizationId, defaultCurrency: null };
    },
    async updateSettings(input: { defaultCurrency: string | null }) {
      if (
        input.defaultCurrency !== null &&
        !Intl.supportedValuesOf("currency").includes(input.defaultCurrency)
      )
        throw new ValidationError("Choose a supported currency code.");
      return context.transaction(async (ctx) => {
        await requireCrmAdmin(ctx);
        const [row] = await ctx.db
          .insert(crmSettings)
          .values({
            organizationId: context.scope.organizationId,
            defaultCurrency: input.defaultCurrency,
          })
          .onConflictDoUpdate({
            target: crmSettings.organizationId,
            set: { defaultCurrency: input.defaultCurrency },
          })
          .returning(publicSettings);
        ctx.effects.hint({
          audience: realtimeKeys.organization(context.scope.organizationId),
          domain: "context",
        });
        return row!;
      });
    },
  };
}
