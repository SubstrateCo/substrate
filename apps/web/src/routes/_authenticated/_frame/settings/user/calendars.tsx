import { createFileRoute } from "@tanstack/react-router";

import { CalendarSettingsPage } from "@/components/calendar/settings/calendar-settings";

export const Route = createFileRoute("/_authenticated/_frame/settings/user/calendars")({
  component: CalendarsRoute,
});

function CalendarsRoute() {
  const { session } = Route.useRouteContext();
  const organizationId = session.session.activeOrganizationId ?? null;
  return <CalendarSettingsPage key={organizationId} organizationId={organizationId} />;
}
