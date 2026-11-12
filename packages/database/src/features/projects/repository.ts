import {
  managedPicture,
  profilePicturePath,
  projectIcon,
} from "@substrate/contracts/files/pictures";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { activeActorCondition, visibleActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { permissionRepository } from "../../core/permissions/repository";
import { entityGrants } from "../../core/permissions/schema";
import { RepositoryContext, type PermissionLevel } from "../../core/repository-context";
import { requiredText } from "../../core/validation";
import { AccessDeniedError, ValidationError } from "../../errors";
import { liveProjectTasks } from "../tasks/access";
import { requireUnassignedProjectActor } from "../tasks/assignment";
import { projectTaskLinks } from "../tasks/links";
import { tasks } from "../tasks/tasks.schema";
import { queryProjects } from "./queries";
import { projects } from "./schema";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export function projectRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const name = sql<string>`case when ${actors.type} = 'agent'
    then coalesce(${userAgents.name}, 'Agent') else ${user.name} end`;
  // This uncorrelated lookup also supports contexts that contain only an ActorScope.
  const viewerUserId =
    scope.userId !== undefined
      ? sql`${scope.userId}`
      : sql`(select coalesce(viewer.user_id, owner.user_id)
    from ${actors} viewer left join ${userAgents} owner on owner.id = viewer.user_agent_id
    where viewer.entity_id = ${scope.actorEntityId} and viewer.organization_id = ${scope.organizationId})`;
  const image = sql<string | null>`case when ${actors.type} = 'agent' then
    case when ${userAgents.userId} = ${viewerUserId}
      then '/api/v1/files/' || ${userAgents.imageFileId}::text || '/content' end
    else case when ${member.id} is not null then ${user.image} end end`.mapWith(
    (value: string | null) => {
      const parsed = managedPicture.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
  );
  const projectWhere = (id: string) =>
    and(eq(projects.organizationId, scope.organizationId), eq(projects.entityId, id));
  async function getWithLevel(entityId: string) {
    const actorEntity = alias(entities, "project_viewer_entity");
    const [row] = await db
      .select({
        project: projects,
        level: sql<PermissionLevel | null>`${context.accessLevel(projects.entityId)}`,
      })
      .from(projects)
      .innerJoin(
        actors,
        and(
          eq(actors.organizationId, scope.organizationId),
          eq(actors.entityId, scope.actorEntityId),
        ),
      )
      .innerJoin(
        actorEntity,
        and(
          eq(actorEntity.organizationId, actors.organizationId),
          eq(actorEntity.entityId, actors.entityId),
          isNull(actorEntity.deletedAt),
        ),
      )
      .where(and(projectWhere(entityId), activeActorCondition()));
    if (!row?.level) throw new AccessDeniedError();
    return { project: row.project, level: row.level };
  }
  async function get(entityId: string) {
    return (await getWithLevel(entityId)).project;
  }
  function members(projectEntityId: string) {
    return db
      .select({
        actorEntityId: actors.entityId,
        name,
        image,
        type: actors.type,
        level: entityGrants.level,
      })
      .from(entityGrants)
      .innerJoin(
        actors,
        and(
          eq(actors.organizationId, entityGrants.organizationId),
          eq(actors.entityId, entityGrants.actorEntityId),
        ),
      )
      .leftJoin(user, eq(user.id, actors.userId))
      .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
      .leftJoin(
        member,
        and(eq(member.userId, user.id), eq(member.organizationId, scope.organizationId)),
      )
      .where(
        and(
          eq(entityGrants.organizationId, scope.organizationId),
          eq(entityGrants.entityId, projectEntityId),
        ),
      )
      .orderBy(asc(name), asc(actors.entityId));
  }
  function availableActors(projectEntityId: string) {
    // Organization actors are discoverable only inside an accessible project, not across organizations.
    // Another user's agent appears only as the assignee of a readable task in this project.
    const assignable = and(activeActorCondition(), visibleActorCondition(scope));
    const assignedAgents = db
      .select({ id: tasks.assigneeActorEntityId })
      .from(tasks)
      .where(liveProjectTasks(scope, projectEntityId));
    return db
      .select({
        entityId: actors.entityId,
        name,
        image,
        type: actors.type,
        assignable: sql<boolean>`coalesce(${assignable}, false)`,
      })
      .from(actors)
      .innerJoin(entities, eq(entities.entityId, actors.entityId))
      .leftJoin(user, eq(user.id, actors.userId))
      .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
      .leftJoin(
        member,
        and(eq(member.userId, user.id), eq(member.organizationId, scope.organizationId)),
      )
      .where(
        and(
          eq(actors.organizationId, scope.organizationId),
          isNull(entities.deletedAt),
          or(assignable, and(eq(actors.type, "agent"), inArray(actors.entityId, assignedAgents))),
        ),
      )
      .orderBy(asc(name), asc(actors.entityId));
  }
  return {
    get,
    async delete(entityId: string) {
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        const { entity } = await ctx.requireAccess(entityId, "owner", true, "structural");
        if (entity.entityType !== "project") throw new AccessDeniedError();
        ctx.effects.hint({
          audience: realtimeKeys.organization(scope.organizationId),
          domain: "access",
        });
        await tx
          .update(entities)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(entities.organizationId, scope.organizationId),
              eq(entities.accessEntityId, entityId),
            ),
          );
      });
    },
    async revoke(entityId: string, actorEntityId: string) {
      return context.transaction(async (ctx) => {
        const { entity } = await ctx.requireAccess(entityId, "owner", true, "structural");
        if (entity.entityType !== "project") throw new AccessDeniedError();
        await requireUnassignedProjectActor(ctx, entityId, actorEntityId);
        await permissionRepository(ctx).revoke({ entityId, actorEntityId });
      });
    },
    async getPicture(entityId: string, minimum: "view" | "edit" = "view") {
      await context.requireAccess(entityId, minimum);
      const [project] = await db
        .select({ image: projects.image })
        .from(projects)
        .where(projectWhere(entityId));
      if (!project) throw new AccessDeniedError();
      return project.image;
    },
    async setPicture(entityId: string, image: string | null) {
      const parsed = projectIcon.safeParse(image);
      if (
        !parsed.success ||
        (image !== null && !image.startsWith(`${profilePicturePath("project-icon", entityId)}?v=`))
      )
        throw new ValidationError("Use an uploaded icon for this project.");
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        await ctx.requireAccess(entityId, "edit", true);
        const [project] = await tx
          .update(projects)
          .set({ image })
          .where(projectWhere(entityId))
          .returning();
        if (!project) throw new AccessDeniedError();
        await ctx.touch(entityId);
        ctx.effects.hint({
          audience: realtimeKeys.organization(scope.organizationId),
          domain: "tasks",
        });
        return project;
      });
    },
    /** Actors the caller may assign in this project, under the same policy as getDetail. */
    async assignableActors(projectEntityId: string) {
      await get(projectEntityId);
      const rows = await availableActors(projectEntityId);
      return rows.filter((row) => row.assignable);
    },
    async getDetail(projectEntityId: string) {
      const { project, level } = await getWithLevel(projectEntityId);
      const [projectMembers, projectActors, projectTasks, links] = await Promise.all([
        members(projectEntityId),
        availableActors(projectEntityId),
        db
          .select()
          .from(tasks)
          .where(liveProjectTasks(scope, projectEntityId))
          .orderBy(asc(tasks.entityId)),
        projectTaskLinks(context, projectEntityId),
      ]);
      return {
        project,
        level,
        members: projectMembers,
        actors: projectActors,
        tasks: projectTasks,
        links,
      };
    },
    async create(input: { name: string; description?: string }) {
      const name = requiredText(input.name, 200);
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        const entity = await ctx.createEntity("project");
        const [project] = await tx
          .insert(projects)
          .values({
            entityId: entity.entityId,
            organizationId: scope.organizationId,
            name,
            description: input.description ?? "",
          })
          .returning();
        ctx.effects.hint({
          audience: realtimeKeys.organization(scope.organizationId),
          domain: "tasks",
        });
        return project!;
      });
    },
    async list() {
      return queryProjects(context);
    },
    async update(entityId: string, input: { name: string; description: string }) {
      const name = requiredText(input.name, 200);
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        await ctx.requireAccess(entityId, "edit", true);
        const [project] = await tx
          .update(projects)
          .set({ name, description: input.description })
          .where(projectWhere(entityId))
          .returning();
        if (!project) throw new AccessDeniedError();
        await ctx.touch(entityId);
        ctx.effects.hint({
          audience: realtimeKeys.organization(scope.organizationId),
          domain: "tasks",
        });
        return project;
      });
    },
  };
}
