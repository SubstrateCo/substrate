import type { DatabaseExecutor } from "../client";
import { AccessDeniedError, ValidationError } from "../errors";
import { activeActorCondition, permissionActorEntityId } from "./actors/access";
import { actors } from "./actors/schema";
import { effectExecutor, effectsFor, type RepositoryEffects } from "./effects";
import { rootEntityValues } from "./entities/identity";
import { entities } from "./entities/schema";
import { entityGrants, permissionLevel } from "./permissions/schema";
import { entityAccessLevel, lockAccessPaths, readableCondition } from "./permissions/visibility";
import type { WorkspaceScope } from "./session/identity";
import { and, eq, exists, isNull, sql, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface ActorScope {
  organizationId: string;
  actorEntityId: string;
}

export type PermissionLevel = (typeof permissionLevel.enumValues)[number];
const permissionRank: Record<PermissionLevel, number> = { view: 0, comment: 1, edit: 2, owner: 3 };

type AtLeast = {
  view: PermissionLevel;
  comment: "comment" | "edit" | "owner";
  edit: "edit" | "owner";
  owner: "owner";
};
declare const lockedAt: unique symbol;
/** Read after requireAccess(entityId, minimum, true) locked the access path in this transaction. */
export type Locked<T, Minimum extends PermissionLevel> = T & {
  readonly [lockedAt]: AtLeast[Minimum];
};
export interface EntityAccess {
  entity: typeof entities.$inferSelect;
  level: PermissionLevel;
}
export type LockedAccess<Minimum extends PermissionLevel> = Locked<EntityAccess, Minimum>;

export class RepositoryContext {
  readonly scope: Readonly<ActorScope & Partial<Pick<WorkspaceScope, "userId" | "admin">>>;

  constructor(
    readonly db: DatabaseExecutor,
    scope: ActorScope & Partial<Pick<WorkspaceScope, "userId" | "admin">>,
    effects?: RepositoryEffects,
  ) {
    this.db = effects ? effectExecutor(db, effects) : db;
    this.scope = Object.freeze({
      ...scope,
      organizationId: scope.organizationId,
      actorEntityId: scope.actorEntityId,
    });
  }

  // Reads need no collector. A write without one fails in effectsFor instead of dropping hints.
  get effects() {
    return effectsFor(this.db);
  }

  async transaction<T>(work: (context: RepositoryContext) => Promise<T>) {
    return this.db.transaction((tx) => work(new RepositoryContext(tx, this.scope)));
  }

  async requireActiveActor(actorEntityId = this.scope.actorEntityId) {
    const [actor] = await this.db
      .select({ entityId: actors.entityId, type: actors.type })
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
    return actor;
  }

  // Locks the entities and their access containers in one statement and one global order. Read
  // grants in a later statement, after any competing writer commits.
  async lockAccessPaths(entityIds: string[]) {
    if (!entityIds.length) return;
    // Inactive or forged scopes take no locks: the statement locks only for an active actor.
    // A missing row also means a missing entity, which every caller denies.
    const locked = new Set(
      (await this.db.execute<{ entityId: string }>(lockAccessPaths(this.scope, entityIds))).map(
        (row) => row.entityId,
      ),
    );
    if (entityIds.some((id) => !locked.has(id))) throw new AccessDeniedError();
  }

  async lockAccessPath(entityId: string) {
    await this.lockAccessPaths([entityId]);
  }

  requireAccess<Minimum extends PermissionLevel>(
    entityId: string,
    minimum: Minimum,
    lock: true,
  ): Promise<LockedAccess<Minimum>>;
  requireAccess(entityId: string, minimum: PermissionLevel, lock?: boolean): Promise<EntityAccess>;
  async requireAccess(
    entityId: string,
    minimum: PermissionLevel,
    lock = false,
  ): Promise<EntityAccess> {
    // Fail closed: an unknown level would otherwise compare as granted.
    if (!Object.hasOwn(permissionRank, minimum)) throw new AccessDeniedError();
    if (lock) await this.lockAccessPath(entityId);
    const actorEntity = alias(entities, "actor_entity");
    const [access] = await this.db
      .select({
        entity: entities,
        level: sql<PermissionLevel | null>`${entityAccessLevel(this.scope, entityId)}`,
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

  async actorCanAccess(actorEntityId: string, entityId: string, minimum: PermissionLevel) {
    if (!Object.hasOwn(permissionRank, minimum)) return false;
    const scope = { organizationId: this.scope.organizationId, actorEntityId };
    const [row] = await this.db
      .select({ level: sql<PermissionLevel | null>`${entityAccessLevel(scope, entityId)}` })
      .from(actors)
      .innerJoin(
        entities,
        and(
          eq(entities.organizationId, actors.organizationId),
          eq(entities.entityId, actors.entityId),
        ),
      )
      .where(
        and(
          eq(actors.organizationId, scope.organizationId),
          eq(actors.entityId, actorEntityId),
          activeActorCondition(),
          isNull(entities.deletedAt),
        ),
      );
    return !!row?.level && permissionRank[row.level] >= permissionRank[minimum];
  }

  // A root entity owned by the actor's person. Children use createChildEntity.
  async createEntity(entityType: typeof entities.$inferInsert.entityType) {
    await this.requireActiveActor();
    const [entity] = await this.db
      .insert(entities)
      .values(rootEntityValues(this.scope.organizationId, entityType))
      .returning();
    await this.db.insert(entityGrants).values({
      organizationId: this.scope.organizationId,
      entityId: entity!.entityId,
      actorEntityId: permissionActorEntityId(this.scope),
      level: "owner",
    });
    return entity!;
  }

  // The child takes the parent's container, so a child of a child shares the root container.
  async createChildEntity(
    entityType: typeof entities.$inferInsert.entityType,
    parent: LockedAccess<"edit">,
  ) {
    const [entity] = await this.db
      .insert(entities)
      .values({
        organizationId: this.scope.organizationId,
        entityType,
        accessEntityId: sql`(SELECT access_entity_id FROM ${entities} WHERE organization_id = ${this.scope.organizationId} AND entity_id = ${parent.entity.entityId})`,
      })
      .returning();
    return entity!;
  }

  // List filter: the entity in `entityId` is readable at `minimum`. Runs one visibility CTE.
  readable(entityId: SQLWrapper, minimum: PermissionLevel = "view") {
    return readableCondition(this.scope, entityId, minimum);
  }

  // The actor's level on the entity in `entityId`, or NULL. Walks up from each row, so use it
  // for a few rows, not a whole table.
  accessLevel(entityId: SQLWrapper) {
    return entityAccessLevel(this.scope, entityId);
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
