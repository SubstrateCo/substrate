import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { isAccessFailure } from "@/components/feedback/request-failure";
import { WorkspaceLinkBoundary } from "@/components/workspace/workspace-link-boundary";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace")({
  component: WorkspaceLayout,
  validateSearch: z.object({ workspaceId: z.string().min(1).max(200).optional() }),
  beforeLoad: async ({ context }) => {
    const organizationId = context.session.session.activeOrganizationId;
    if (!organizationId) throw redirect({ to: "/organizations" });
    try {
      // Realtime organization and access hints and reconnect resyncs invalidate or reset this
      // entry, so a cached one is current and navigation does not wait for the network.
      await context.queryClient.query({
        ...currentOrganizationQueryOptions(organizationId),
        staleTime: Infinity,
      });
      return { organizationId };
    } catch (error) {
      if (error instanceof Error && isAccessFailure(error))
        throw redirect({ to: "/organizations" });
      throw error;
    }
  },
});

function WorkspaceLayout() {
  const { organizationId } = Route.useRouteContext();
  const { workspaceId } = Route.useSearch();
  return (
    <WorkspaceLinkBoundary organizationId={organizationId} workspaceId={workspaceId}>
      <Outlet />
    </WorkspaceLinkBoundary>
  );
}
