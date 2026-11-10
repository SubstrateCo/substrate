import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { isAccessFailure } from "@/components/feedback/request-failure";
import { WorkspaceLinkBoundary } from "@/components/workspace/workspace-link-boundary";
import { organizationQueryOptions } from "@/queries/organizations/options";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace")({
  component: WorkspaceLayout,
  validateSearch: z.object({ workspaceId: z.string().min(1).max(200).optional() }),
  beforeLoad: async ({ context }) => {
    const organizationId = context.session.session.activeOrganizationId;
    if (!organizationId) throw redirect({ to: "/organizations" });
    try {
      const organization = await context.queryClient.query(
        organizationQueryOptions(organizationId),
      );
      return { organizationId, organization };
    } catch (error) {
      if (error instanceof Error && isAccessFailure(error))
        throw redirect({ to: "/organizations" });
      throw error;
    }
  },
});

function WorkspaceLayout() {
  const { organizationId } = Route.useRouteContext();
  return (
    <WorkspaceLinkBoundary organizationId={organizationId}>
      <Outlet />
    </WorkspaceLinkBoundary>
  );
}
