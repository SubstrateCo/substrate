import { realtimeKeys } from "@substrate/contracts/realtime";

import type { RepositoryContext } from "../../core/repository-context";
import { notify } from "../notifications/effects";
import { taskActivity } from "./schema";

/** Records the actor's actions on a task in one insert, in order. */
export async function recordTaskActivity(
  context: RepositoryContext,
  taskEntityId: string,
  actions: string[],
  sourceMessageId?: string,
) {
  if (!actions.length) return [];
  context.effects.hint({
    audience: realtimeKeys.organization(context.scope.organizationId),
    domain: "tasks",
  });
  return context.db
    .insert(taskActivity)
    .values(
      actions.map((action) => ({
        organizationId: context.scope.organizationId,
        taskEntityId,
        actorEntityId: context.scope.actorEntityId,
        action,
        sourceMessageId,
      })),
    )
    .returning();
}

export async function notifyAssignment(
  context: RepositoryContext,
  taskEntityId: string,
  recipient: string | null | undefined,
  eventKey: string,
) {
  if (!recipient || recipient === context.scope.actorEntityId) return;
  await notify(context, "assignment", [{ actorEntityId: recipient }], {
    entityId: taskEntityId,
    eventKey,
  });
}
