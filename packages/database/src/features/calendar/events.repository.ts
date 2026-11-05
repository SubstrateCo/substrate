import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { AccessDeniedError, ValidationError } from "../../errors";
import { RepositoryContext, pageSize } from "../../core/repository-context";
import { calendarRepository } from "./calendars.repository";
import { calendarEvents } from "./events.schema";
import { eventTimingColumns, type EventTiming } from "./timing";
import { eventAttendeeRepository } from "./attendees.repository";
import { eventExceptionRepository } from "./exceptions.repository";
import { requireCalendarEvent } from "./events.access";
import { validateRecurrenceChange } from "./recurrence";

type EventContent = Pick<
  typeof calendarEvents.$inferInsert,
  "title" | "description" | "location" | "recurrenceRule"
>;

export function calendarEventRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    async create(
      input: EventContent & {
        calendarEntityId: string;
        timing: EventTiming;
        providerEventId?: string;
      },
    ) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await calendarRepository(ctx).get(input.calendarEntityId);
        const entity = await ctx.createEntity("calendar_event", input.calendarEntityId);
        const [event] = await tx
          .insert(calendarEvents)
          .values({
            entityId: entity.entityId,
            organizationId: scope.organizationId,
            calendarEntityId: input.calendarEntityId,
            title: input.title,
            description: input.description,
            location: input.location,
            recurrenceRule: input.recurrenceRule,
            providerEventId: input.providerEventId,
            ...eventTimingColumns(input.timing),
          })
          .returning();
        return event!;
      });
    },
    async get(entityId: string) {
      return requireCalendarEvent(context, entityId, "view");
    },
    async list(calendarEntityId: string, options: { limit?: number; afterEntityId?: string } = {}) {
      await calendarRepository(context).get(calendarEntityId);
      return db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.organizationId, scope.organizationId),
            eq(calendarEvents.calendarEntityId, calendarEntityId),
            inArray(calendarEvents.entityId, context.readableEntities()),
            options.afterEntityId ? gt(calendarEvents.entityId, options.afterEntityId) : undefined,
          ),
        )
        .orderBy(asc(calendarEvents.entityId))
        .limit(pageSize(options.limit));
    },
    async update(entityId: string, input: Partial<EventContent> & { timing?: EventTiming }) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(entityId, "edit", true);
        if (input.recurrenceRule !== undefined)
          await validateRecurrenceChange(ctx, entityId, input.recurrenceRule);
        const update: Partial<typeof calendarEvents.$inferInsert> = {
          title: input.title,
          description: input.description,
          location: input.location,
          recurrenceRule: input.recurrenceRule,
        };
        if (input.timing) Object.assign(update, eventTimingColumns(input.timing));
        if (
          input.title === undefined &&
          input.description === undefined &&
          input.location === undefined &&
          input.recurrenceRule === undefined &&
          input.timing === undefined
        )
          throw new ValidationError("At least one event field is required.");
        const [event] = await tx
          .update(calendarEvents)
          .set(update)
          .where(
            and(
              eq(calendarEvents.organizationId, scope.organizationId),
              eq(calendarEvents.entityId, entityId),
            ),
          )
          .returning();
        if (!event) throw new AccessDeniedError();
        await ctx.touch(entityId);
        return event;
      });
    },
    ...eventAttendeeRepository(context),
    ...eventExceptionRepository(context),
  };
}
