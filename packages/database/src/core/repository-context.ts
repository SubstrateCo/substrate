import { requiredAppsForEntityType } from "@substrate/contracts/apps";

import { AccessDeniedError, ConflictError, ValidationError } from "../errors";
import { activeActorCondition, permissionActorEntityId } from "./actors/access";
import { actors } from "./actors/schema";
import { requireAppEnabled } from "./apps/access";
import { effectExecutor, effectsFor, type RepositoryEffects } from "./effects";
import { rootEntityValues } from "./entities/identity";
import { entities } from "./entities/schema";
import type { DatabaseExecutor } from "./executor";
import { entityGrants, permissionLevel } from "./permissions/schema";
import { entityAccessLevel, isMemberEdited, readableCondition } from "./permissions/visibility";
import type { WorkspaceScope } from "./session/identity";
import { and, eq, exists, inArray, is, isNull, sql, type SQLWrapper } from "drizzle-orm";
import { alias, PgTransaction } from "drizzle-orm/pg-core";

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
declare const authorizedAt: unique symbol;
/** Read after requireAccess(entityId, minimum) granted the level in this transaction. */
export type Authorized<T, Minimum extends PermissionLevel> = T & {
  readonly [authorizedAt]: AtLeast[Minimum];
};
export interface EntityAccess {
  entity: typeof entities.$inferSelect;
  level: PermissionLevel;
}
export type AuthorizedAccess<Minimum extends PermissionLevel> = Authorized<EntityAccess, Minimum>;

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

  // An open transaction is joined, not given a savepoint: no caller keeps using a transaction
  // after a repository call in it fails. Callers that do must open their own savepoint.
  async transaction<T>(work: (context: RepositoryContext) => Promise<T>) {
    if (is(this.db, PgTransaction)) return work(this);
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

  // The entities with the actor's level and each container's version, in one statement.
  private async readAccess(entityIds: string[], minimum: PermissionLevel) {
    // Fail closed: an unknown level would otherwise compare as granted.
    if (!Object.hasOwn(permissionRank, minimum)) throw new AccessDeniedError();
    const ids = [...new Set(entityIds)];
    if (!ids.length) return [];
    const container = alias(entities, "access_container");
    const rows = await this.db
      .select({
        entity: entities,
        level: sql<PermissionLevel | null>`${entityAccessLevel(this.scope, entities.entityId)}`,
        accessVersion: container.accessVersion,
      })
      .from(entities)
      .innerJoin(
        container,
        and(
          eq(container.organizationId, entities.organizationId),
          eq(container.entityId, entities.accessEntityId),
        ),
      )
      .where(
        and(
          eq(entities.organizationId, this.scope.organizationId),
          ids.length === 1 ? eq(entities.entityId, ids[0]!) : inArray(entities.entityId, ids),
          isNull(entities.deletedAt),
          exists(this.activeScopeActor()),
        ),
      );
    const granted = new Map(
      rows.flatMap((row) =>
        row.level && permissionRank[row.level] >= permissionRank[minimum]
          ? [[row.entity.entityId, { ...row, level: row.level }] as const]
          : [],
      ),
    );
    return ids.map((id) => {
      const access = granted.get(id);
      if (!access) throw new AccessDeniedError();
      return access;
    });
  }

  /**
   * The live entity and the actor's level on it, in one statement and without locks. A revocation
   * that commits after this read does not stop the caller's write. Structural changes use
   * requireStructuralAccess.
   */
  async requireAccess<Minimum extends PermissionLevel>(
    entityId: string,
    minimum: Minimum,
  ): Promise<AuthorizedAccess<Minimum>> {
    const [access] = await this.requireAccessAll([entityId], minimum);
    return access!;
  }

  // requireAccess for several entities in one statement.
  async requireAccessAll<Minimum extends PermissionLevel>(
    entityIds: string[],
    minimum: Minimum,
  ): Promise<AuthorizedAccess<Minimum>[]> {
    const rows = await this.readAccess(entityIds, minimum);
    // SAFETY: readAccess granted at least `minimum`, which is what AuthorizedAccess records.
    return rows.map(({ entity, level }) => ({ entity, level }) as AuthorizedAccess<Minimum>);
  }

  /**
   * requireAccess for a structural change: grants, ownership, moves and deletion. It also claims
   * the change by compare-and-set on the container's access version, so structural changes to
   * one container run one at a time and the loser gets a ConflictError. Read the state that the
   * change depends on after this call: it then includes every earlier structural change.
   */
  async requireStructuralAccess<Minimum extends PermissionLevel>(
    entityId: string,
    minimum: Minimum,
  ): Promise<AuthorizedAccess<Minimum>> {
    const [access] = await this.requireStructuralAccessAll([entityId], minimum);
    return access!;
  }

  // requireStructuralAccess for several entities. Containers are claimed in ID order.
  async requireStructuralAccessAll<Minimum extends PermissionLevel>(
    entityIds: string[],
    minimum: Minimum,
  ): Promise<AuthorizedAccess<Minimum>[]> {
    const rows = await this.readAccess(entityIds, minimum);
    const versions = new Map(rows.map((row) => [row.entity.accessEntityId, row.accessVersion]));
    for (const [containerId, version] of [...versions].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const [claimed] = await this.db
        .update(entities)
        .set({ accessVersion: sql`${entities.accessVersion} + 1` })
        .where(
          and(
            eq(entities.organizationId, this.scope.organizationId),
            eq(entities.entityId, containerId),
            eq(entities.accessVersion, version),
          ),
        )
        .returning({ entityId: entities.entityId });
      if (!claimed) throw new ConflictError("This record changed. Try again.");
    }
    // SAFETY: readAccess granted at least `minimum`, which is what AuthorizedAccess records.
    return rows.map(({ entity, level }) => ({ entity, level }) as AuthorizedAccess<Minimum>);
  }

  private activeScopeActor() {
    const actorEntity = alias(entities, "actor_entity");
    return this.db
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
      );
  }

  async actorCanAccess(actorEntityId: string, entityId: string, minimum: PermissionLevel) {
    return (await this.actorsWithAccess([actorEntityId], entityId, minimum)).has(actorEntityId);
  }

  async actorsWithAccess(actorEntityIds: string[], entityId: string, minimum: PermissionLevel) {
    if (!actorEntityIds.length || !Object.hasOwn(permissionRank, minimum)) return new Set<string>();
    const scope = { organizationId: this.scope.organizationId, actorEntityId: actors.entityId };
    const rows = await this.db
      .select({
        entityId: actors.entityId,
        level: sql<PermissionLevel | null>`${entityAccessLevel(scope, entityId)}`,
      })
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
          inArray(actors.entityId, [...new Set(actorEntityIds)]),
          activeActorCondition(),
          isNull(entities.deletedAt),
        ),
      );
    return new Set(
      rows
        .filter((row) => row.level && permissionRank[row.level] >= permissionRank[minimum])
        .map((row) => row.entityId),
    );
  }

  // A root entity owned by the actor's person, or shared with every member for a member-edited
  // type. Children use createChildEntity.
  async createEntity(entityType: typeof entities.$inferInsert.entityType) {
    for (const app of requiredAppsForEntityType(entityType)) {
      if (app === "tasks" || app === "crm") await requireAppEnabled(this, app);
    }
    await this.requireActiveActor();
    const [entity] = await this.db
      .insert(entities)
      .values(rootEntityValues(this.scope.organizationId, entityType))
      .returning();
    if (isMemberEdited(entityType)) return entity!;
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
    parent: AuthorizedAccess<"edit">,
  ) {
    const parentApps = requiredAppsForEntityType(parent.entity.entityType);
    for (const app of requiredAppsForEntityType(entityType)) {
      if (!parentApps.includes(app) && (app === "tasks" || app === "crm"))
        await requireAppEnabled(this, app);
    }
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function entityCursor(afterEntityId?: string) {
  if (afterEntityId === undefined) return undefined;
  if (!uuidPattern.test(afterEntityId)) throw new ValidationError("Invalid cursor.");
  return afterEntityId;
}

export function pageSize(limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ValidationError("Limit must be an integer from 1 to 100.");
  return limit;
}
