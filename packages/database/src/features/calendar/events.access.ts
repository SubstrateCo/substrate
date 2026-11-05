import { and, eq } from "drizzle-orm";
import { AccessDeniedError } from "../../errors";
import { RepositoryContext, type PermissionLevel } from "../../core/repository-context";
import { calendarEvents } from "./events.schema";

export async function requireCalendarEvent(
  context: RepositoryContext,
  entityId: string,
  minimum: PermissionLevel,
  lock = false,
) {
  await context.requireAccess(entityId, minimum, lock);
  const [event] = await context.db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.organizationId, context.scope.organizationId),
        eq(calendarEvents.entityId, entityId),
      ),
    );
  if (!event) throw new AccessDeniedError();
  return event;
}
