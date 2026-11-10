import { taskStatusLabels } from "@startup-os/contracts/tasks";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { ensureHumanActor } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { adminRoleCondition } from "../../core/organizations/roles";
import { member } from "../../core/organizations/schema";
import { permissionRank, RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import type { MessagingIdentity } from "../messaging/access";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { and, eq, isNull, sql } from "drizzle-orm";

const actorSelection = { entityId: actors.entityId, name: actors.name, type: actors.type };
const adminSelection = sql<boolean>`${adminRoleCondition(member.role)}`;

// Verifies the session identity, membership and active actor in one statement, and reads
// whether the user is an owner or admin of the organization now. Only a human's first workspace
// use takes the provisioning lock.
export async function workspaceContext(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  options: { lockActor?: boolean } = {},
) {
  const identity = and(
    eq(user.id, scope.userId),
    eq(user.emailVerified, true),
    eq(member.organizationId, scope.organizationId),
  );
  let actor: { entityId: string; name: string; type: "human" | "agent" } | undefined;
  let userName: string;
  let admin: boolean;
  if (scope.actorEntityId) {
    const query = db
      .select({ userName: user.name, actor: actorSelection, admin: adminSelection })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .innerJoin(
        actors,
        and(
          eq(actors.entityId, scope.actorEntityId),
          eq(actors.organizationId, member.organizationId),
          eq(actors.type, "agent"),
        ),
      )
      .innerJoin(
        userAgents,
        and(eq(userAgents.id, actors.userAgentId), eq(userAgents.userId, user.id)),
      )
      .innerJoin(
        entities,
        and(
          eq(entities.entityId, actors.entityId),
          eq(entities.organizationId, actors.organizationId),
        ),
      )
      .where(and(identity, activeActorCondition(), isNull(entities.deletedAt)));
    const [row] = await (options.lockActor ? query.for("update", { of: actors }) : query);
    if (!row) throw new AccessDeniedError();
    ({ actor, userName, admin } = row);
  } else {
    const [row] = await db
      .select({
        userName: user.name,
        actor: actorSelection,
        admin: adminSelection,
        disabledAt: actors.disabledAt,
        deletedAt: entities.deletedAt,
      })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .leftJoin(
        actors,
        and(eq(actors.organizationId, member.organizationId), eq(actors.userId, user.id)),
      )
      .leftJoin(
        entities,
        and(
          eq(entities.entityId, actors.entityId),
          eq(entities.organizationId, actors.organizationId),
        ),
      )
      .where(identity);
    if (!row || row.disabledAt || row.deletedAt) throw new AccessDeniedError();
    ({ userName, admin } = row);
    actor = row.actor ?? undefined;
    if (!actor) {
      const created = await ensureHumanActor(db, { ...scope, name: userName });
      actor = { entityId: created.entityId, name: created.name, type: created.type };
      await new RepositoryContext(db, {
        organizationId: scope.organizationId,
        actorEntityId: actor.entityId,
      }).requireActiveActor();
    }
  }
  const context = new RepositoryContext(db, {
    organizationId: scope.organizationId,
    actorEntityId: actor.entityId,
  });
  return { context, actor, userName, admin };
}

export async function requireWork(
  context: RepositoryContext,
  entityId: string,
  level: "view" | "edit" | "owner" = "view",
) {
  const { db, scope } = context;
  const [row] = await db
    .select({
      entityType: entities.entityType,
      task: { title: tasks.title, projectEntityId: tasks.projectEntityId, status: tasks.status },
      projectName: projects.name,
    })
    .from(entities)
    .leftJoin(
      tasks,
      and(eq(tasks.organizationId, entities.organizationId), eq(tasks.entityId, entities.entityId)),
    )
    .leftJoin(
      projects,
      and(
        eq(projects.organizationId, entities.organizationId),
        eq(projects.entityId, entities.entityId),
      ),
    )
    .where(
      and(
        eq(entities.organizationId, scope.organizationId),
        eq(entities.entityId, entityId),
        isNull(entities.deletedAt),
      ),
    );
  if (row?.entityType === "task" && row.task) {
    const { task } = row;
    const own = await context.requireAccess(entityId, level);
    const project = await context.requireAccess(task.projectEntityId, level);
    return {
      entityId,
      entityType: "task" as const,
      title: task.title,
      projectEntityId: task.projectEntityId,
      status: task.status,
      statusName: taskStatusLabels[task.status],
      level: permissionRank[own.level] <= permissionRank[project.level] ? own.level : project.level,
    };
  }
  if (row?.entityType === "project" && row.projectName !== null) {
    const { level: projectLevel } = await context.requireAccess(entityId, level);
    return {
      entityId,
      entityType: "project" as const,
      title: row.projectName,
      projectEntityId: entityId,
      status: null,
      statusName: null,
      level: projectLevel,
    };
  }
  throw new AccessDeniedError();
}
