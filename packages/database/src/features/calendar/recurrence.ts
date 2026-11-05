import { and, eq } from "drizzle-orm";
import { ValidationError } from "../../errors";
import type { RepositoryContext } from "../../core/repository-context";
import { eventRecurrenceExceptions } from "./exceptions.schema";

export async function validateRecurrenceChange(
  context: RepositoryContext,
  entityId: string,
  nextRule: string | null,
) {
  const reference = nextRule
    ? eventRecurrenceExceptions.replacementEventEntityId
    : eventRecurrenceExceptions.eventEntityId;
  const [existing] = await context.db
    .select({ eventEntityId: eventRecurrenceExceptions.eventEntityId })
    .from(eventRecurrenceExceptions)
    .where(
      and(
        eq(eventRecurrenceExceptions.organizationId, context.scope.organizationId),
        eq(reference, entityId),
      ),
    )
    .limit(1);
  if (!existing) return;
  if (nextRule) throw new ValidationError("A recurrence replacement must remain a single event.");
  throw new ValidationError("Remove recurrence exceptions before removing the recurrence rule.");
}
