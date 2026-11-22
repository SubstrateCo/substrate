import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { messagingConversations } from "../messaging/schema";
import { workHint } from "../realtime/routing";
import { taskRepository } from "./repository";
import { eq, sql } from "drizzle-orm";

export function ensureTaskDiscussion(
  context: RepositoryContext,
  taskId: string,
  expectedProjectEntityId?: string,
) {
  return context.transaction(async (ctx) => {
    const task = await taskRepository(ctx).get(taskId, "view");
    if (expectedProjectEntityId && task.projectEntityId !== expectedProjectEntityId)
      throw new AccessDeniedError();
    const [existing] = await ctx.db
      .select({ id: messagingConversations.id })
      .from(messagingConversations)
      .where(eq(messagingConversations.taskEntityId, taskId));
    if (existing) return existing.id;
    const [creator] = await ctx.db
      .select({ userId: sql<string>`coalesce(${actors.userId}, ${userAgents.userId})` })
      .from(actors)
      .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
      .where(eq(actors.entityId, ctx.scope.actorEntityId));
    if (!creator?.userId) throw new AccessDeniedError();
    const [created] = await ctx.db
      .insert(messagingConversations)
      .values({
        organizationId: ctx.scope.organizationId,
        taskEntityId: taskId,
        kind: "group",
        private: true,
        createdBy: creator.userId,
      })
      .onConflictDoNothing({ target: messagingConversations.taskEntityId })
      .returning();
    if (created) {
      ctx.effects.hint(workHint(ctx.scope.organizationId, task.projectEntityId, [taskId]));
      return created.id;
    }
    const [concurrent] = await ctx.db
      .select({ id: messagingConversations.id })
      .from(messagingConversations)
      .where(eq(messagingConversations.taskEntityId, taskId));
    if (!concurrent) throw new AccessDeniedError();
    return concurrent.id;
  });
}
