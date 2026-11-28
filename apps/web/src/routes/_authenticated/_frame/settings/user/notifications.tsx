import { createFileRoute } from "@tanstack/react-router";

import { NotificationSettings } from "@/components/settings/notifications/notification-settings";

export const Route = createFileRoute("/_authenticated/_frame/settings/user/notifications")({
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const { session } = Route.useRouteContext();
  const organizationId = session.session.activeOrganizationId ?? null;
  return (
    <NotificationSettings
      key={organizationId}
      userId={session.user.id}
      organizationId={organizationId}
    />
  );
}
