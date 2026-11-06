import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { notifications } from "../notifications/schema";
import { taskActivity } from "./schema";
import { eq } from "drizzle-orm";

export async function recordTaskActivity(
  context: RepositoryContext,
  taskEntityId: string,
  action: string,
  sourceMessageId?: string,
) {
  const [event] = await context.db
    .insert(taskActivity)
    .values({
      organizationId: context.scope.organizationId,
      taskEntityId,
      actorEntityId: context.scope.actorEntityId,
      action,
      sourceMessageId,
    })
    .returning();
  return event!;
}

export async function notifyAssignment(
  context: RepositoryContext,
  taskEntityId: string,
  recipient: string | null | undefined,
  eventKey: string,
) {
  if (!recipient || recipient === context.scope.actorEntityId) return;
  const [actor] = await context.db.select().from(actors).where(eq(actors.entityId, recipient));
  if (!actor || actor.type !== "human") return;
  await context.db
    .insert(notifications)
    .values({
      organizationId: context.scope.organizationId,
      recipientActorEntityId: recipient,
      kind: "assignment",
      entityId: taskEntityId,
      eventKey,
    })
    .onConflictDoNothing();
}
