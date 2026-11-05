import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { ValidationError } from "../../errors";
import { RepositoryContext, pageSize } from "../../core/repository-context";
import { eventRecurrenceExceptions } from "./exceptions.schema";
import { requireCalendarEvent } from "./events.access";

type ExceptionInput = { occurrenceKey: string } & (
  | { cancelled: true }
  | { cancelled: false; replacementEventEntityId: string }
);

export function eventExceptionRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    async setException(eventEntityId: string, input: ExceptionInput) {
      await db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        const event = await requireCalendarEvent(ctx, eventEntityId, "edit", true);
        if (!event.recurrenceRule)
          throw new ValidationError("Exceptions require a recurring event.");
        const replacementEventEntityId = input.cancelled ? null : input.replacementEventEntityId;
        if (replacementEventEntityId) {
          const replacement = await requireCalendarEvent(ctx, replacementEventEntityId, "edit");
          if (replacement.recurrenceRule)
            throw new ValidationError("A replacement must be a single event.");
        }
        await tx
          .insert(eventRecurrenceExceptions)
          .values({
            organizationId: scope.organizationId,
            eventEntityId,
            calendarEntityId: event.calendarEntityId,
            occurrenceKey: input.occurrenceKey,
            cancelled: input.cancelled,
            replacementEventEntityId,
          })
          .onConflictDoUpdate({
            target: [
              eventRecurrenceExceptions.organizationId,
              eventRecurrenceExceptions.eventEntityId,
              eventRecurrenceExceptions.occurrenceKey,
            ],
            set: { cancelled: input.cancelled, replacementEventEntityId },
          });
        await ctx.touch(eventEntityId);
      });
    },
    async listExceptions(
      eventEntityId: string,
      options: { limit?: number; afterOccurrenceKey?: string } = {},
    ) {
      await requireCalendarEvent(context, eventEntityId, "view");
      return db
        .select()
        .from(eventRecurrenceExceptions)
        .where(
          and(
            eq(eventRecurrenceExceptions.organizationId, scope.organizationId),
            eq(eventRecurrenceExceptions.eventEntityId, eventEntityId),
            or(
              isNull(eventRecurrenceExceptions.replacementEventEntityId),
              inArray(
                eventRecurrenceExceptions.replacementEventEntityId,
                context.readableEntities(),
              ),
            ),
            options.afterOccurrenceKey
              ? gt(eventRecurrenceExceptions.occurrenceKey, options.afterOccurrenceKey)
              : undefined,
          ),
        )
        .orderBy(asc(eventRecurrenceExceptions.occurrenceKey))
        .limit(pageSize(options.limit));
    },
    async removeException(eventEntityId: string, occurrenceKey: string) {
      await db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await requireCalendarEvent(ctx, eventEntityId, "edit", true);
        await tx
          .delete(eventRecurrenceExceptions)
          .where(
            and(
              eq(eventRecurrenceExceptions.organizationId, scope.organizationId),
              eq(eventRecurrenceExceptions.eventEntityId, eventEntityId),
              eq(eventRecurrenceExceptions.occurrenceKey, occurrenceKey),
            ),
          );
        await ctx.touch(eventEntityId);
      });
    },
  };
}
