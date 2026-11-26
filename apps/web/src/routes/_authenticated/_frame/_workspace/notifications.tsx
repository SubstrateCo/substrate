import { createFileRoute } from "@tanstack/react-router";

import { NotificationList } from "@/components/context/notifications/notification-list";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/notifications")({
  component: NotificationsRoute,
});

function NotificationsRoute() {
  return <NotificationList />;
}
