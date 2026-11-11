import { profilePicturePath, projectIcon } from "@substrate/contracts/files/pictures";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { activeActorCondition, visibleActorCondition } from "../../core/actors/access";
import { actorDisplayName } from "../../core/actors/display-name";
import { actorPicture } from "../../core/actors/picture";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { permissionRepository } from "../../core/permissions/repository";
import { entityGrants } from "../../core/permissions/schema";
import { RepositoryContext } from "../../core/repository-context";
import { requiredText } from "../../core/validation";
import { AccessDeniedError, ValidationError } from "../../errors";
import { liveProjectTasks } from "../tasks/access";
import { requireUnassignedProjectActor } from "../tasks/assignment";
import { projectTaskLinks } from "../tasks/links";
import { tasks } from "../tasks/tasks.schema";
import { queryProjects } from "./queries";
import { projects } from "./schema";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

export function projectRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const projectWhere = (id: string) =>
    and(eq(projects.organizationId, scope.organizationId), eq(projects.entityId, id));
  async function getWithLevel(entityId: string) {
    const { level } = await context.requireAccess(entityId, "view");
    const [project] = await db.select().from(projects).where(projectWhere(entityId));
    if (!project) throw new AccessDeniedError();
    return { project, level };
  }
  async function get(entityId: string) {
    return (await getWithLevel(entityId)).project;
  }
  function members(projectEntityId: string) {
    return db
      .select({
        actorEntityId: actors.entityId,
        name: actorDisplayName(),
        image: actorPicture(scope),
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
      .where(
        and(
          eq(entityGrants.organizationId, scope.organizationId),
          eq(entityGrants.entityId, projectEntityId),
        ),
      )
      .orderBy(asc(actorDisplayName()), asc(actors.entityId));
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
        name: actorDisplayName(),
        image: actorPicture(scope),
        type: actors.type,
        assignable: sql<boolean>`coalesce(${assignable}, false)`,
      })
      .from(actors)
      .innerJoin(entities, eq(entities.entityId, actors.entityId))
      .where(
        and(
          eq(actors.organizationId, scope.organizationId),
          isNull(entities.deletedAt),
          or(assignable, and(eq(actors.type, "agent"), inArray(actors.entityId, assignedAgents))),
        ),
      )
      .orderBy(asc(actorDisplayName()), asc(actors.entityId));
  }
  return {
    get,
    async delete(entityId: string) {
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        const { entity } = await ctx.requireAccess(entityId, "owner", true);
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
        const { entity } = await ctx.requireAccess(entityId, "owner", true);
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
