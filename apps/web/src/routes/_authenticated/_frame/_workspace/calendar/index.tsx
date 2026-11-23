import { createFileRoute } from "@tanstack/react-router";

import { CalendarWorkspace } from "@/components/calendar/workspace/calendar-workspace";
import { AppAvailability } from "@/components/workspace/app-availability";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/calendar/")({
  component: CalendarRoute,
  validateSearch: z.object({
    view: z.enum(["agenda", "week"]).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .catch(undefined),
    eventId: z.uuid().optional().catch(undefined),
  }),
});

function CalendarRoute() {
  const { organizationId } = Route.useRouteContext();
  const { view, date, eventId } = Route.useSearch();
  return (
    <AppAvailability app="calendar">
      <CalendarWorkspace
        key={organizationId}
        organizationId={organizationId}
        view={view ?? "agenda"}
        date={date}
        eventId={eventId}
      />
    </AppAvailability>
  );
}
