import { contactInteractions } from "../../../core/contacts/interactions/interactions.schema";
import { entityLinks } from "../../../core/links/schema";
import { appEnabledCondition } from "../../../core/permissions/app-visibility";
import type { RepositoryContext } from "../../../core/repository-context";
import { calendarEvents } from "../../calendar/schema";
import { and, eq, exists, or } from "drizzle-orm";

export function interactionCalendarFilter(context: RepositoryContext, calendarEntityId?: string) {
  if (!calendarEntityId) return undefined;
  return and(
    eq(contactInteractions.origin, "calendar_event"),
    appEnabledCondition(context.scope.organizationId, "calendar"),
    exists(
      context.db
        .select({ entityId: calendarEvents.entityId })
        .from(calendarEvents)
        .innerJoin(
          entityLinks,
          and(
            eq(entityLinks.organizationId, calendarEvents.organizationId),
            eq(entityLinks.relationType, "related_to"),
            or(
              and(
                eq(entityLinks.sourceEntityId, contactInteractions.entityId),
                eq(entityLinks.targetEntityId, calendarEvents.entityId),
              ),
              and(
                eq(entityLinks.targetEntityId, contactInteractions.entityId),
                eq(entityLinks.sourceEntityId, calendarEvents.entityId),
              ),
            ),
          ),
        )
        .where(
          and(
            eq(calendarEvents.organizationId, context.scope.organizationId),
            eq(calendarEvents.calendarEntityId, calendarEntityId),
            context.readable(calendarEvents.entityId),
          ),
        ),
    ),
  );
}
