import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { WorkspaceTools } from "@/components/context/workspace-tools";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { WorkspaceLinkBoundary } from "@/components/workspace/workspace-link-boundary";
import { organizationQueryOptions } from "@/queries/organizations/options";
import { isAccessFailure } from "@/ui/feedback/request-failure";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_workspace")({
  component: WorkspaceLayout,
  validateSearch: z.object({ workspaceId: z.string().min(1).max(200).optional() }),
  beforeLoad: async ({ context }) => {
    const organizationId = context.session.session.activeOrganizationId;
    if (!organizationId) throw redirect({ to: "/organizations" });
    try {
      const organization = await context.queryClient.query(
        organizationQueryOptions(organizationId),
      );
      return { organizationId, organization, userName: context.session.user.name };
    } catch (error) {
      if (error instanceof Error && isAccessFailure(error))
        throw redirect({ to: "/organizations" });
      throw error;
    }
  },
});

function WorkspaceLayout() {
  const { organizationId, userName } = Route.useRouteContext();
  return (
    <WorkspaceFrame organizationId={organizationId} name={userName}>
      <WorkspaceLinkBoundary organizationId={organizationId}>
        <WorkspaceTools key={organizationId} organizationId={organizationId} />
        <Outlet />
      </WorkspaceLinkBoundary>
    </WorkspaceFrame>
  );
}
