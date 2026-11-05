import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { RepositoryContext } from "../../core/repository-context";
import { eventAttendees } from "./attendees.schema";
import { requireCalendarEvent } from "./events.access";

type AttendeeInput = Pick<
  typeof eventAttendees.$inferInsert,
  "address" | "displayName" | "contactEntityId" | "response"
>;

export function eventAttendeeRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    async addAttendee(eventEntityId: string, input: AttendeeInput) {
      await db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        const event = await requireCalendarEvent(ctx, eventEntityId, "edit", true);
        if (input.contactEntityId) await ctx.requireAccess(input.contactEntityId, "view");
        await tx
          .insert(eventAttendees)
          .values({
            organizationId: scope.organizationId,
            eventEntityId,
            calendarEntityId: event.calendarEntityId,
            address: input.address.trim().toLowerCase(),
            displayName: input.displayName,
            contactEntityId: input.contactEntityId,
            response: input.response,
          })
          .onConflictDoUpdate({
            target: [
              eventAttendees.organizationId,
              eventAttendees.eventEntityId,
              eventAttendees.address,
            ],
            set: {
              displayName: input.displayName ?? null,
              contactEntityId: input.contactEntityId ?? null,
              response: input.response ?? "needs_action",
            },
          });
        await ctx.touch(eventEntityId);
      });
    },
    async listAttendees(eventEntityId: string) {
      await requireCalendarEvent(context, eventEntityId, "view");
      return db
        .select({
          address: eventAttendees.address,
          displayName: eventAttendees.displayName,
          response: eventAttendees.response,
          contactEntityId: sql<
            string | null
          >`CASE WHEN ${inArray(eventAttendees.contactEntityId, context.readableEntities())} THEN ${eventAttendees.contactEntityId} ELSE NULL END`,
        })
        .from(eventAttendees)
        .where(
          and(
            eq(eventAttendees.organizationId, scope.organizationId),
            eq(eventAttendees.eventEntityId, eventEntityId),
          ),
        )
        .orderBy(asc(eventAttendees.address));
    },
    async removeAttendee(eventEntityId: string, address: string) {
      await db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await requireCalendarEvent(ctx, eventEntityId, "edit", true);
        await tx
          .delete(eventAttendees)
          .where(
            and(
              eq(eventAttendees.organizationId, scope.organizationId),
              eq(eventAttendees.eventEntityId, eventEntityId),
              eq(eventAttendees.address, address.trim().toLowerCase()),
            ),
          );
        await ctx.touch(eventEntityId);
      });
    },
  };
}
