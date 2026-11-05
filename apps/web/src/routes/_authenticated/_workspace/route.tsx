import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { organizationQueryOptions } from "@/queries/organizations/options";

export const Route = createFileRoute("/_authenticated/_workspace")({
  component: WorkspaceLayout,
  beforeLoad: async ({ context }) => {
    const organizationId = context.session.session.activeOrganizationId;
    if (!organizationId) throw redirect({ to: "/organizations" });
    try {
      const organization = await context.queryClient.query(
        organizationQueryOptions(organizationId),
      );
      return { organizationId, organization, userName: context.session.user.name };
    } catch {
      throw redirect({ to: "/organizations" });
    }
  },
});

function WorkspaceLayout() {
  const { organizationId, userName } = Route.useRouteContext();
  return (
    <WorkspaceFrame organizationId={organizationId} name={userName}>
      <Outlet />
    </WorkspaceFrame>
  );
}
