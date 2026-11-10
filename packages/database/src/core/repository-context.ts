import type { DatabaseExecutor } from "../client";
import { AccessDeniedError, ValidationError } from "../errors";
import { activeActorCondition, permissionActorEntityId } from "./actors/access";
import { actors } from "./actors/schema";
import { entities } from "./entities/schema";
import { entityAccessParents } from "./permissions/access-parents";
import { entityGrants, permissionLevel } from "./permissions/schema";
import { visibilityCte, lockAccessPath } from "./permissions/visibility";
import { and, eq, exists, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface ActorScope {
  organizationId: string;
  actorEntityId: string;
}

export type PermissionLevel = (typeof permissionLevel.enumValues)[number];
export const permissionRank = { view: 0, comment: 1, edit: 2, owner: 3 };

export class RepositoryContext {
  readonly scope: Readonly<ActorScope>;

  constructor(
    readonly db: DatabaseExecutor,
    scope: ActorScope,
  ) {
    this.scope = Object.freeze({
      organizationId: scope.organizationId,
      actorEntityId: scope.actorEntityId,
    });
  }

  async requireActiveActor(actorEntityId = this.scope.actorEntityId) {
    const [actor] = await this.db
      .select({ entityId: actors.entityId })
      .from(actors)
      .innerJoin(
        entities,
        and(
          eq(entities.entityId, actors.entityId),
          eq(entities.organizationId, actors.organizationId),
        ),
      )
      .where(
        and(
          eq(actors.organizationId, this.scope.organizationId),
          eq(actors.entityId, actorEntityId),
          activeActorCondition(),
          isNull(entities.deletedAt),
        ),
      );
    if (!actor) throw new AccessDeniedError();
  }

  // Locks the entity and its access ancestors. Read grants in a later statement, after any
  // competing writer commits.
  async lockAccessPath(entityId: string) {
    // Inactive or forged scopes must not take locks.
    await this.requireActiveActor();
    await this.db.execute(lockAccessPath(this.scope, entityId));
  }

  async requireAccess(entityId: string, minimum: PermissionLevel, lock = false) {
    // Fail closed: an unknown level would otherwise compare as granted.
    if (!Object.hasOwn(permissionRank, minimum)) throw new AccessDeniedError();
    if (lock) await this.lockAccessPath(entityId);
    const actorEntity = alias(entities, "actor_entity");
    const [access] = await this.db
      .select({
        entity: entities,
        level: sql<PermissionLevel | null>`(${visibilityCte(this.scope)}
          SELECT level FROM visible_entities WHERE entity_id = ${entityId} ORDER BY level DESC LIMIT 1)`,
      })
      .from(entities)
      .where(
        and(
          eq(entities.organizationId, this.scope.organizationId),
          eq(entities.entityId, entityId),
          isNull(entities.deletedAt),
          exists(
            this.db
              .select({ one: sql`1` })
              .from(actors)
              .innerJoin(
                actorEntity,
                and(
                  eq(actorEntity.entityId, actors.entityId),
                  eq(actorEntity.organizationId, actors.organizationId),
                ),
              )
              .where(
                and(
                  eq(actors.organizationId, this.scope.organizationId),
                  eq(actors.entityId, this.scope.actorEntityId),
                  activeActorCondition(),
                  isNull(actorEntity.deletedAt),
                ),
              ),
          ),
        ),
      );
    if (!access || !access.level || permissionRank[access.level] < permissionRank[minimum])
      throw new AccessDeniedError();
    return { entity: access.entity, level: access.level };
  }

  async createEntity(entityType: typeof entities.$inferInsert.entityType, parentEntityId?: string) {
    if (parentEntityId) {
      await this.requireAccess(parentEntityId, "edit", true);
      return this.createChildEntity(entityType, parentEntityId);
    }
    await this.requireActiveActor();
    const [entity] = await this.db
      .insert(entities)
      .values({ organizationId: this.scope.organizationId, entityType })
      .returning();
    await this.db.insert(entityGrants).values({
      organizationId: this.scope.organizationId,
      entityId: entity!.entityId,
      actorEntityId: permissionActorEntityId(this.scope),
      level: "owner",
    });
    return entity!;
  }

  // The caller must already hold requireAccess(parentEntityId, "edit", true) in this transaction.
  async createChildEntity(
    entityType: typeof entities.$inferInsert.entityType,
    parentEntityId: string,
  ) {
    const [entity] = await this.db
      .insert(entities)
      .values({ organizationId: this.scope.organizationId, entityType })
      .returning();
    await this.db.insert(entityAccessParents).values({
      organizationId: this.scope.organizationId,
      entityId: entity!.entityId,
      parentEntityId,
    });
    return entity!;
  }

  readableEntities() {
    return sql`(${visibilityCte(this.scope)} SELECT DISTINCT entity_id FROM visible_entities)`;
  }

  async touch(entityId: string) {
    await this.db
      .update(entities)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(entities.organizationId, this.scope.organizationId),
          eq(entities.entityId, entityId),
        ),
      );
  }
}

export function pageSize(limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ValidationError("Limit must be an integer from 1 to 100.");
  return limit;
}
