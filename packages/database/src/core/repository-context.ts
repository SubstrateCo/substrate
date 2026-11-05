import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { AccessDeniedError, ValidationError } from "../errors";
import { actors } from "./actors/schema";
import { entities } from "./entities/schema";
import { entityGrants, permissionLevel } from "./permissions/schema";
import { member } from "./organizations/schema";
import { entityAccessParents } from "./permissions/access-parents";
import { visibilityCte, lockAccessPath } from "./permissions/visibility";

export interface ActorScope {
  organizationId: string;
  actorEntityId: string;
}

export type PermissionLevel = (typeof permissionLevel.enumValues)[number];
const permissionRank = { view: 0, comment: 1, edit: 2, owner: 3 };

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
      .leftJoin(
        member,
        and(eq(member.organizationId, actors.organizationId), eq(member.userId, actors.userId)),
      )
      .where(
        and(
          eq(actors.organizationId, this.scope.organizationId),
          eq(actors.entityId, actorEntityId),
          isNull(actors.disabledAt),
          isNull(entities.deletedAt),
          or(eq(actors.type, "agent"), sql`${member.id} IS NOT NULL`),
        ),
      );
    if (!actor) throw new AccessDeniedError();
  }

  async requireAccess(entityId: string, minimum: PermissionLevel, lock = false) {
    if (!Object.hasOwn(permissionRank, minimum))
      throw new ValidationError("Unknown permission level.");
    await this.requireActiveActor();
    if (lock) {
      // Lock first, then read grants in a fresh statement after any competing writer commits.
      await this.db.execute(lockAccessPath(this.scope, entityId));
    }
    const [entity] = await this.db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.organizationId, this.scope.organizationId),
          eq(entities.entityId, entityId),
          isNull(entities.deletedAt),
        ),
      );
    const [grant] = await this.db.execute<{
      level: PermissionLevel;
    }>(sql`${visibilityCte(this.scope)}
      SELECT level FROM visible_entities WHERE entity_id = ${entityId} ORDER BY level DESC LIMIT 1`);
    if (!entity || !grant || permissionRank[grant.level] < permissionRank[minimum])
      throw new AccessDeniedError();
    return { entity, level: grant.level };
  }

  async createEntity(entityType: typeof entities.$inferInsert.entityType, parentEntityId?: string) {
    await this.requireActiveActor();
    if (parentEntityId) await this.requireAccess(parentEntityId, "edit", true);
    const [entity] = await this.db
      .insert(entities)
      .values({ organizationId: this.scope.organizationId, entityType })
      .returning();
    if (parentEntityId) {
      await this.db
        .insert(entityAccessParents)
        .values({
          organizationId: this.scope.organizationId,
          entityId: entity!.entityId,
          parentEntityId,
        });
    } else {
      await this.db.insert(entityGrants).values({
        organizationId: this.scope.organizationId,
        entityId: entity!.entityId,
        actorEntityId: this.scope.actorEntityId,
        level: "owner",
      });
    }
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
