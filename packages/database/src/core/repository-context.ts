import type { EntityType } from "@substrate/contracts/access/entity-rules";
import { requiredAppsForEntityType } from "@substrate/contracts/apps";

import { AccessDeniedError, AppDisabledError, ConflictError, ValidationError } from "../errors";
import { activeActorCondition, permissionActorEntityId } from "./actors/access";
import { actors } from "./actors/schema";
import { requireAppsEnabled } from "./apps/access";
import { effectExecutor, effectsFor, type RepositoryEffects } from "./effects";
import { rootEntityValues } from "./entities/identity";
import { entities } from "./entities/schema";
import type { DatabaseExecutor } from "./executor";
import { entityAppsEnabled } from "./permissions/app-visibility";
import { entityGrants, permissionLevel } from "./permissions/schema";
import {
  activeScopeActorCondition,
  entityAccessLevel,
  isMemberEdited,
  organizationAdminCondition,
  readableCondition,
} from "./permissions/visibility";
import type { WorkspaceScope } from "./session/identity";
import { and, eq, inArray, is, isNull, sql, type SQLWrapper } from "drizzle-orm";
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
export type Authorized<T, Minimum extends PermissionLevel> = T & {
  readonly [authorizedAt]: AtLeast[Minimum];
};
export interface EntityAccess {
  entity: typeof entities.$inferSelect;
  level: PermissionLevel;
}
export type AuthorizedAccess<Minimum extends PermissionLevel> = Authorized<EntityAccess, Minimum>;

export interface AccessOptions {
  type?: EntityType | readonly EntityType[];
}

const activeActor = alias(actors, "active_actor");
const activeActorEntity = alias(entities, "active_actor_entity");

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

  get effects() {
    return effectsFor(this.db);
  }

  async transaction<T>(work: (context: RepositoryContext) => Promise<T>) {
    if (is(this.db, PgTransaction)) return work(this);
    return this.db.transaction((tx) => work(new RepositoryContext(tx, this.scope)));
  }

  private activeActor(actorEntityId: string) {
    return {
      entityOn: and(
        eq(activeActorEntity.entityId, activeActor.entityId),
        eq(activeActorEntity.organizationId, activeActor.organizationId),
      ),
      where: and(
        eq(activeActor.organizationId, this.scope.organizationId),
        eq(activeActor.entityId, actorEntityId),
        activeActorCondition(activeActor),
        isNull(activeActorEntity.deletedAt),
      ),
    };
  }

  async requireActiveActor(actorEntityId = this.scope.actorEntityId) {
    const active = this.activeActor(actorEntityId);
    const [actor] = await this.db
      .select({
        entityId: activeActor.entityId,
        type: activeActor.type,
        userId: activeActor.userId,
      })
      .from(activeActor)
      .innerJoin(activeActorEntity, active.entityOn)
      .where(active.where);
    if (!actor) throw new AccessDeniedError();
    return actor;
  }

  async requireOrganizationAdmin({ human = false }: { human?: boolean } = {}) {
    if (!(await this.isOrganizationAdmin({ human }))) throw new AccessDeniedError();
  }

  async isOrganizationAdmin({ human = false }: { human?: boolean } = {}) {
    const active = this.activeActor(this.scope.actorEntityId);
    const [actor] = await this.db
      .select({
        type: activeActor.type,
        admin: sql<boolean>`${organizationAdminCondition(this.scope)}`,
      })
      .from(activeActor)
      .innerJoin(activeActorEntity, active.entityOn)
      .where(active.where);
    return !!actor?.admin && (!human || actor.type === "human");
  }

  private async readAccess(entityIds: string[], minimum: PermissionLevel, options: AccessOptions) {
    if (!Object.hasOwn(permissionRank, minimum)) throw new AccessDeniedError();
    const ids = [...new Set(entityIds)];
    if (!ids.length) return [];
    const container = alias(entities, "access_container");
    const rows = await this.db
      .select({
        entity: entities,
        level: sql<PermissionLevel | null>`${entityAccessLevel(this.scope, entities.entityId, { apps: false })}`,
        appsEnabled: sql<boolean>`${entityAppsEnabled(this.scope.organizationId, entities.entityType)}`,
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
          activeScopeActorCondition(this.scope),
        ),
      );
    const granted = new Map(
      rows.flatMap((row) =>
        row.level && permissionRank[row.level] >= permissionRank[minimum]
          ? [[row.entity.entityId, { ...row, level: row.level }] as const]
          : [],
      ),
    );
    const types = options.type === undefined ? undefined : [options.type].flat();
    const accesses = ids.map((id) => {
      const access = granted.get(id);
      if (!access || (types && !types.includes(access.entity.entityType)))
        throw new AccessDeniedError();
      return access;
    });
    if (accesses.some((access) => !access.appsEnabled)) throw new AppDisabledError();
    return accesses;
  }

  async requireAccess<Minimum extends PermissionLevel>(
    entityId: string,
    minimum: Minimum,
    options: AccessOptions = {},
  ): Promise<AuthorizedAccess<Minimum>> {
    const [access] = await this.requireAccessAll([entityId], minimum, options);
    return access!;
  }

  async requireAccessAll<Minimum extends PermissionLevel>(
    entityIds: string[],
    minimum: Minimum,
    options: AccessOptions = {},
  ): Promise<AuthorizedAccess<Minimum>[]> {
    const rows = await this.readAccess(entityIds, minimum, options);
    // SAFETY: readAccess granted at least `minimum`, which is what AuthorizedAccess records.
    return rows.map(({ entity, level }) => ({ entity, level }) as AuthorizedAccess<Minimum>);
  }

  async requireStructuralAccess<Minimum extends PermissionLevel>(
    entityId: string,
    minimum: Minimum,
    options: AccessOptions = {},
  ): Promise<AuthorizedAccess<Minimum>> {
    const [access] = await this.requireStructuralAccessAll([entityId], minimum, options);
    return access!;
  }

  async requireStructuralAccessAll<Minimum extends PermissionLevel>(
    entityIds: string[],
    minimum: Minimum,
    options: AccessOptions = {},
  ): Promise<AuthorizedAccess<Minimum>[]> {
    const rows = await this.readAccess(entityIds, minimum, options);
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

  async createEntity(entityType: EntityType) {
    await requireAppsEnabled(this, requiredAppsForEntityType(entityType));
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

  async createChildEntity(entityType: EntityType, parent: AuthorizedAccess<"edit">) {
    const parentApps = requiredAppsForEntityType(parent.entity.entityType);
    await requireAppsEnabled(
      this,
      requiredAppsForEntityType(entityType).filter((app) => !parentApps.includes(app)),
    );
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

  async deny(
    entityId: string,
    minimum: PermissionLevel = "view",
    options: AccessOptions = {},
  ): Promise<never> {
    await this.requireAccess(entityId, minimum, options);
    throw new AccessDeniedError();
  }

  readable(entityId: SQLWrapper, minimum: PermissionLevel = "view", type?: EntityType) {
    return readableCondition(this.scope, entityId, minimum, type);
  }

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
