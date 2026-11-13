import type { RepositoryContext } from "../../core/repository-context";
import { notify } from "../notifications/effects";
import { workChangeHints, workHint } from "../realtime/routing";
import { taskActivity } from "./schema";

/** Records the actor's actions on a task in one insert, in order. */
export async function recordTaskActivity(
  context: RepositoryContext,
  task: { entityId: string; projectEntityId?: string },
  actions: string[],
  sourceMessageId?: string,
) {
  if (!actions.length) return [];
  const taskEntityId = task.entityId;
  const { organizationId } = context.scope;
  const rows = await context.db
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
  // An activity row records a change to the task, so the task's readers refresh it. Callers
  // without the task's project cost one read of it.
  const hints = task.projectEntityId
    ? [workHint(organizationId, task.projectEntityId, [taskEntityId])]
    : await workChangeHints(context.db, organizationId, [taskEntityId]);
  for (const hint of hints) context.effects.hint(hint);
  return rows;
}

export async function notifyAssignment(
  context: RepositoryContext,
  taskEntityId: string,
  recipient: string | null | undefined,
  eventKey: string,
) {
  if (!recipient || recipient === context.scope.actorEntityId) return;
  await notify(context, [{ kind: "assignment", recipients: [{ actorEntityId: recipient }] }], {
    entityId: taskEntityId,
    eventKey,
  });
}
