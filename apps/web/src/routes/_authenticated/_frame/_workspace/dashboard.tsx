import { createFileRoute } from "@tanstack/react-router";

import { HomeDashboard } from "@/components/home/home-dashboard";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/dashboard")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const { organizationId, session } = Route.useRouteContext();
  return <HomeDashboard organizationId={organizationId} userId={session.user.id} />;
}
