import type { RecordArchiveFilter } from "@substrate/contracts/crm/input";
import {
  managedPicture,
  profilePicturePath,
  projectIcon,
} from "@substrate/contracts/files/pictures";
import { realtimeKeys } from "@substrate/contracts/realtime";
import type { TaskStatus } from "@substrate/contracts/tasks";

import {
  activeActorCondition,
  permissionActorEntityId,
  visibleActorCondition,
} from "../../core/actors/access";
import { joinedActorAvatar } from "../../core/actors/avatar";
import { joinedActorName } from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { changePermission } from "../../core/permissions/repository";
import { entityGrants } from "../../core/permissions/schema";
import { entityReaders } from "../../core/permissions/visibility";
import { RepositoryContext, type PermissionLevel } from "../../core/repository-context";
import { requiredText } from "../../core/validation";
import { AccessDeniedError, ValidationError } from "../../errors";
import { messagingConversations } from "../messaging/schema";
import { workHint } from "../realtime/routing";
import { liveProjectTasks } from "../tasks/access";
import { requireUnassignedProjectActor } from "../tasks/assignment";
import { firstTaskExportPage } from "../tasks/export-query";
import { projectTaskLinkRows, toLinkView } from "../tasks/links";
import { tasks } from "../tasks/tasks.schema";
import { requireUnarchived } from "./archive";
import { queryProjects } from "./queries";
import { projects } from "./schema";
import { and, count, eq, inArray, isNotNull, isNull, or, sql, type SQLWrapper } from "drizzle-orm";
import { type SelectedFields } from "drizzle-orm/pg-core";

export function projectRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const name = joinedActorName();
  // Joined on `user`: whether the person is still a member here.
  const organizationMember = and(
    eq(member.userId, user.id),
    eq(member.organizationId, scope.organizationId),
  );
  // Read inside JSON aggregates; withPictures accepts only managed pictures afterwards.
  const image = sql<string | null>`case when ${actors.type} = 'agent' then null
    else case when ${member.id} is not null then ${user.image} end end`;
  const avatar = joinedActorAvatar();
  const projectWhere = (id: string) =>
    and(eq(projects.organizationId, scope.organizationId), eq(projects.entityId, id));
  // The project row and the actor's level. A row exists only when the actor can read the
  // project, so the extra fields are never computed for a reader without access.
  function selectWithLevel<T extends SelectedFields>(entityId: string, fields: T) {
    const level = sql<PermissionLevel | null>`${context.accessLevel(projects.entityId)}`;
    return db
      .select({ ...fields, project: projects, level })
      .from(projects)
      .where(and(projectWhere(entityId), sql`${level} IS NOT NULL`));
  }
  async function get(entityId: string) {
    const [row] = await selectWithLevel(entityId, {});
    if (!row) return context.deny(entityId, "view", { type: "project" });
    return row.project;
  }
  // A JSON object with the given keys. Keys are fixed identifiers in this file.
  function jsonObject(fields: Record<string, SQLWrapper>) {
    return sql.join(
      Object.entries(fields).map(([key, value]) => sql`${sql.raw(`'${key}'`)}, ${value}`),
      sql`, `,
    );
  }
  function members(projectEntityId: string) {
    return db
      .select({
        items: sql<
          {
            actorEntityId: string;
            name: string;
            image: string | null;
            avatar: string | null;
            type: "human" | "agent";
            level: PermissionLevel;
          }[]
        >`coalesce(json_agg(json_build_object(${jsonObject({
          actorEntityId: actors.entityId,
          name,
          image,
          avatar,
          type: actors.type,
          level: entityGrants.level,
        })}) ORDER BY ${name}, ${actors.entityId}), '[]'::json)`,
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
      .leftJoin(member, organizationMember)
      .where(
        and(
          eq(entityGrants.organizationId, scope.organizationId),
          eq(entityGrants.entityId, projectEntityId),
        ),
      );
  }
  function availableActors(projectEntityId: string) {
    // Organization actors are discoverable only inside an accessible project, not across organizations.
    // Another user's agent appears only as the assignee of a readable task in this project.
    const listed = and(activeActorCondition(), visibleActorCondition(scope));
    // Assignable matches requireAssignee: listed, and able to read the project. Agents read
    // through their owner. The readers subquery runs once for all actors.
    const assignable = and(
      listed,
      sql`${permissionActorEntityId({ organizationId: scope.organizationId, actorEntityId: actors.entityId })} IN (${entityReaders(scope.organizationId, projectEntityId)})`,
    );
    const assignedAgents = db
      .select({ id: tasks.assigneeActorEntityId })
      .from(tasks)
      .where(liveProjectTasks(scope, projectEntityId));
    return db
      .select({
        items: sql<
          {
            entityId: string;
            name: string;
            image: string | null;
            avatar: string | null;
            type: "human" | "agent";
            assignable: boolean;
          }[]
        >`coalesce(json_agg(json_build_object(${jsonObject({
          entityId: actors.entityId,
          name,
          image,
          avatar,
          type: actors.type,
          assignable: sql`coalesce(${assignable}, false)`,
        })}) ORDER BY ${name}, ${actors.entityId}), '[]'::json)`,
      })
      .from(actors)
      .innerJoin(entities, eq(entities.entityId, actors.entityId))
      .leftJoin(user, eq(user.id, actors.userId))
      .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
      .leftJoin(member, organizationMember)
      .where(
        and(
          eq(actors.organizationId, scope.organizationId),
          isNull(entities.deletedAt),
          or(listed, and(eq(actors.type, "agent"), inArray(actors.entityId, assignedAgents))),
        ),
      );
  }
  function projectTasks(projectEntityId: string) {
    return db
      .select({
        items: sql<
          (Pick<
            typeof tasks.$inferSelect,
            | "entityId"
            | "projectEntityId"
            | "parentTaskEntityId"
            | "title"
            | "description"
            | "status"
            | "priority"
            | "assigneeActorEntityId"
            | "dueDate"
          > & { discussionConversationId: string | null })[]
        >`coalesce(json_agg(json_build_object(${jsonObject({
          entityId: tasks.entityId,
          projectEntityId: tasks.projectEntityId,
          parentTaskEntityId: tasks.parentTaskEntityId,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          assigneeActorEntityId: tasks.assigneeActorEntityId,
          dueDate: tasks.dueDate,
          discussionConversationId: messagingConversations.id,
        })}) ORDER BY ${tasks.entityId}), '[]'::json)`,
      })
      .from(tasks)
      .leftJoin(
        messagingConversations,
        and(
          eq(messagingConversations.organizationId, tasks.organizationId),
          eq(messagingConversations.taskEntityId, tasks.entityId),
        ),
      )
      .where(liveProjectTasks(scope, projectEntityId));
  }
  // Each list is aggregated on its own, so one list's rows never multiply another's.
  function scalar<T>(query: SQLWrapper & PromiseLike<{ items: T }[]>) {
    return sql<T>`(${query})`;
  }
  const withPictures = <T extends { image: string | null }>(rows: T[]) =>
    rows.map((row) => {
      const parsed = managedPicture.safeParse(row.image);
      return { ...row, image: parsed.success ? parsed.data : null };
    });
  // A structural change: it claims the project's version, like delete and sharing do.
  function setArchived(entityId: string, archived: boolean) {
    return context.transaction(async (ctx) => {
      await ctx.requireStructuralAccess(entityId, "owner", { type: "project" });
      // The old state is in the WHERE, so a repeated call changes nothing.
      const [changed] = await ctx.db
        .update(projects)
        .set(
          archived
            ? { archivedAt: new Date(), archivedByActorEntityId: scope.actorEntityId }
            : { archivedAt: null, archivedByActorEntityId: null },
        )
        .where(
          and(
            projectWhere(entityId),
            archived ? isNull(projects.archivedAt) : isNotNull(projects.archivedAt),
          ),
        )
        .returning();
      if (!changed) return;
      await ctx.touch(entityId);
      ctx.effects.hint(workHint(scope.organizationId, entityId));
      ctx.effects.hint(workHint(scope.organizationId, entityId, [], "context"));
    });
  }
  return {
    get,
    /** get, with the caller's level, members and live task counts by status in one statement. */
    async getWithTaskCounts(entityId: string) {
      const counts = db
        .select({ status: tasks.status, total: count().as("total") })
        .from(tasks)
        .where(liveProjectTasks(scope, entityId))
        .groupBy(tasks.status)
        .as("project_task_counts");
      const [row] = await selectWithLevel(entityId, {
        taskCounts: scalar(
          db
            .select({
              items: sql<
                { status: TaskStatus; total: number }[]
              >`coalesce(json_agg(json_build_object(${jsonObject({
                status: counts.status,
                total: counts.total,
              })})), '[]'::json)`,
            })
            .from(counts),
        ),
        members: scalar(members(entityId)),
      });
      if (!row) return context.deny(entityId, "view", { type: "project" });
      return {
        project: row.project,
        level: row.level!,
        members: row.members,
        taskCounts: row.taskCounts,
      };
    },
    async exportStart(entityId: string) {
      const [row] = await selectWithLevel(entityId, {
        firstPage: firstTaskExportPage(context, entityId),
      });
      if (!row) return context.deny(entityId, "view", { type: "project" });
      return { project: row.project, firstPage: row.firstPage };
    },
    /** Makes the project and its tasks read-only. Owners and organization admins only. */
    archive: (entityId: string) => setArchived(entityId, true),
    restore: (entityId: string) => setArchived(entityId, false),
    /** Deletes an archived project. Archive it first. */
    async delete(entityId: string) {
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        // The claim comes first, so a restore in flight is either committed or fails after this.
        await ctx.requireStructuralAccess(entityId, "owner", { type: "project" });
        const [project] = await tx
          .select({ archivedAt: projects.archivedAt })
          .from(projects)
          .where(projectWhere(entityId));
        if (!project) throw new AccessDeniedError();
        if (!project.archivedAt) throw new ValidationError("Archive the project first.");
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
    share(entityId: string, actorEntityId: string, level: PermissionLevel) {
      return context.transaction(async (ctx) => {
        const access = await ctx.requireStructuralAccess(entityId, "owner", { type: "project" });
        await requireUnarchived(ctx, [entityId]);
        await changePermission(ctx, access, { actorEntityId, level });
      });
    },
    async revoke(entityId: string, actorEntityId: string) {
      return context.transaction(async (ctx) => {
        const access = await ctx.requireStructuralAccess(entityId, "owner", { type: "project" });
        await requireUnarchived(ctx, [entityId]);
        await requireUnassignedProjectActor(ctx, entityId, actorEntityId);
        // The caller's organization role can change during the checks above. Check ownership
        // again last. A demotion that commits after this read does not stop the revocation.
        await ctx.requireAccess(entityId, "owner");
        await changePermission(ctx, access, { actorEntityId });
      });
    },
    async getPicture(entityId: string, minimum: "view" | "edit" = "view") {
      const [row] = await db
        .select({ image: projects.image })
        .from(projects)
        .where(
          and(projectWhere(entityId), context.readable(projects.entityId, minimum, "project")),
        );
      if (!row) return context.deny(entityId, minimum, { type: "project" });
      return row.image;
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
        await ctx.requireAccess(entityId, "edit");
        await requireUnarchived(ctx, [entityId]);
        const [project] = await tx
          .update(projects)
          .set({ image })
          .where(projectWhere(entityId))
          .returning();
        if (!project) throw new AccessDeniedError();
        await ctx.touch(entityId);
        ctx.effects.hint(workHint(scope.organizationId, entityId));
        return project;
      });
    },
    /** Actors the caller may assign in this project, under the same policy as getDetail. */
    async assignableActors(projectEntityId: string) {
      const [row] = await selectWithLevel(projectEntityId, {
        actors: scalar(availableActors(projectEntityId)),
      });
      if (!row) return context.deny(projectEntityId, "view", { type: "project" });
      return withPictures(row.actors).filter((row) => row.assignable);
    },
    async getDetail(projectEntityId: string) {
      const [row] = await selectWithLevel(projectEntityId, {
        members: scalar(members(projectEntityId)),
        actors: scalar(availableActors(projectEntityId)),
        tasks: scalar(projectTasks(projectEntityId)),
        links: projectTaskLinkRows(context, projectEntityId),
      });
      if (!row) return context.deny(projectEntityId, "view", { type: "project" });
      return {
        project: row.project,
        level: row.level!,
        members: withPictures(row.members),
        actors: withPictures(row.actors),
        tasks: row.tasks,
        links: row.links.map(toLinkView),
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
        // Only the creator and admins can read a new project.
        ctx.effects.hint(workHint(scope.organizationId, entity.entityId));
        return project!;
      });
    },
    /** Active projects unless `archived` asks for archived ones or all. */
    async list(archived: RecordArchiveFilter = "active") {
      return queryProjects(context, {}, archived);
    },
    async update(entityId: string, input: { name: string; description: string }) {
      const name = requiredText(input.name, 200);
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        await ctx.requireAccess(entityId, "edit");
        await requireUnarchived(ctx, [entityId]);
        const [project] = await tx
          .update(projects)
          .set({ name, description: input.description })
          .where(projectWhere(entityId))
          .returning();
        if (!project) throw new AccessDeniedError();
        await ctx.touch(entityId);
        ctx.effects.hint(workHint(scope.organizationId, entityId));
        return project;
      });
    },
  };
}
