import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { requireAppEnabled } from "../../core/apps/access";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { entityGrants } from "../../core/permissions/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

export function crmManagementRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const activeHuman = and(
    eq(actors.organizationId, scope.organizationId),
    eq(actors.type, "human"),
    activeActorCondition(),
    isNull(entities.deletedAt),
  );
  const actorEntity = and(
    eq(entities.organizationId, actors.organizationId),
    eq(entities.entityId, actors.entityId),
  );
  return {
    async people() {
      await requireAppEnabled(context, "crm");
      return db
        .select({ entityId: actors.entityId, userId: user.id, type: sql<"human">`'human'` })
        .from(actors)
        .innerJoin(entities, actorEntity)
        .innerJoin(user, eq(user.id, actors.userId))
        .where(activeHuman)
        .orderBy(asc(actors.entityId));
    },
    async grants(entityId: string) {
      await context.requireAccess(entityId, "owner", { type: ["account", "deal"] });
      return db
        .select({ actorEntityId: entityGrants.actorEntityId, level: entityGrants.level })
        .from(entityGrants)
        .innerJoin(
          actors,
          and(
            eq(actors.organizationId, entityGrants.organizationId),
            eq(actors.entityId, entityGrants.actorEntityId),
          ),
        )
        .innerJoin(entities, actorEntity)
        .innerJoin(user, eq(user.id, actors.userId))
        .where(
          and(
            eq(entityGrants.organizationId, scope.organizationId),
            eq(entityGrants.entityId, entityId),
            activeHuman,
          ),
        )
        .orderBy(asc(entityGrants.actorEntityId));
    },
  };
}
