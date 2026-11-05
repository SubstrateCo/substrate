import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/workspace/dashboard";

export const Route = createFileRoute("/_authenticated/_workspace/dashboard")({
  component: DashboardRoute,
});
function DashboardRoute() {
  const { organizationId, userName } = Route.useRouteContext();
  return <Dashboard organizationId={organizationId} name={userName} />;
}
