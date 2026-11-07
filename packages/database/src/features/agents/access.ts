import type { Database } from "../../client";
import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { permissionRepository } from "../../core/permissions/repository";
import { entityGrants } from "../../core/permissions/schema";
import { RepositoryContext, type ActorScope } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { projectRepository } from "../projects/repository";
import { and, eq, isNull } from "drizzle-orm";

export function agentAccessRepository(db: Database, userId: string, scope: ActorScope) {
  const context = new RepositoryContext(db, scope);
  async function requireAgent(agentId: string) {
    await context.requireActiveActor();
    const [agent] = await db
      .select({ id: userAgents.id })
      .from(userAgents)
      .where(
        and(
          eq(userAgents.id, agentId),
          eq(userAgents.userId, userId),
          isNull(userAgents.deletedAt),
        ),
      );
    if (!agent) throw new AccessDeniedError();
  }
  return {
    async list(agentId: string) {
      await requireAgent(agentId);
      const projects = await projectRepository(context).list();
      const grants = await db
        .select({ entityId: entityGrants.entityId, level: entityGrants.level })
        .from(entityGrants)
        .innerJoin(
          actors,
          and(
            eq(actors.entityId, entityGrants.actorEntityId),
            eq(actors.organizationId, entityGrants.organizationId),
          ),
        )
        .where(
          and(eq(actors.organizationId, scope.organizationId), eq(actors.userAgentId, agentId)),
        );
      return Promise.all(
        projects.map(async (project) => ({
          entityId: project.entityId,
          name: project.name,
          level: grants.find((grant) => grant.entityId === project.entityId)?.level ?? null,
          canManage:
            (await permissionRepository(context).getEffectiveLevel(project.entityId)) === "owner",
        })),
      );
    },
    async change(input: {
      agentId: string;
      projectEntityId: string;
      level: "view" | "comment" | "edit" | null;
    }) {
      await requireAgent(input.agentId);
      await db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await projectRepository(ctx).get(input.projectEntityId);
        await ctx.requireAccess(input.projectEntityId, "owner", true);
        const permissions = permissionRepository(ctx);
        if (input.level) {
          const actor = await ensureUserAgentActor(tx, {
            organizationId: scope.organizationId,
            userId,
            userAgentId: input.agentId,
          });
          await permissions.grant({
            entityId: input.projectEntityId,
            actorEntityId: actor.entityId,
            level: input.level,
          });
        } else {
          const [actor] = await tx
            .select({ entityId: actors.entityId })
            .from(actors)
            .where(
              and(
                eq(actors.organizationId, scope.organizationId),
                eq(actors.userAgentId, input.agentId),
              ),
            );
          if (actor)
            await permissions.revoke({
              entityId: input.projectEntityId,
              actorEntityId: actor.entityId,
            });
        }
      });
      return null;
    },
  };
}
