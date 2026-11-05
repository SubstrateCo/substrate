import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireVerifiedSession } from "@/queries/auth/session";
import { organizationQueryOptions } from "@/queries/organizations/options";
import { Dashboard } from "@/components/workspace/dashboard";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const session = await requireVerifiedSession(context.queryClient, "/dashboard");
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) throw redirect({ to: "/organizations" });
    try {
      await context.queryClient.query(organizationQueryOptions(organizationId));
    } catch {
      throw redirect({ to: "/organizations" });
    }
    return { organizationId, userName: session.user.name };
  },
  component: DashboardRoute,
});
function DashboardRoute() {
  const { organizationId, userName } = Route.useRouteContext();
  return <Dashboard organizationId={organizationId} name={userName} />;
}
