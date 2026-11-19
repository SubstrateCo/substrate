import { realtimeKeys } from "@substrate/contracts/realtime";

import { permissionActorEntityId } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { adminRoleCondition } from "../../core/organizations/roles";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { crmSettings } from "./settings.schema";
import { and, eq, type SQL } from "drizzle-orm";

export function requireCrmAdmin(context: RepositoryContext) {
  return requireAdminActor(context, permissionActorEntityId(context.scope));
}

/** Requires the scope's own actor to be a human admin; an owner's agent is refused. */
export function requireHumanCrmAdmin(context: RepositoryContext) {
  return requireAdminActor(context, context.scope.actorEntityId);
}

async function requireAdminActor(context: RepositoryContext, actorEntityId: string | SQL) {
  await context.requireActiveActor();
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
      ),
    );
  if (!admin) throw new AccessDeniedError();
}
export function settingsRepository(context: RepositoryContext) {
  return {
    async settings() {
      await context.requireActiveActor();
      const [row] = await context.db
        .select()
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
          .returning();
        ctx.effects.hint({
          audience: realtimeKeys.organization(context.scope.organizationId),
          domain: "context",
        });
        return row!;
      });
    },
  };
}
