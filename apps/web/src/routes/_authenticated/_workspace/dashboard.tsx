import { createFileRoute } from "@tanstack/react-router";
import { MessagingWorkspace } from "@/components/messaging/messaging-workspace";

export const Route = createFileRoute("/_authenticated/_workspace/dashboard")({
  component: DashboardRoute,
});
function DashboardRoute() {
  const { organizationId } = Route.useRouteContext();
  return <MessagingWorkspace organizationId={organizationId} />;
}
