import { createFileRoute, Outlet } from "@tanstack/react-router";

import { WorkspaceLinkBoundary } from "@/components/workspace/workspace-link-boundary";
import { WorkspaceRecordSheet } from "@/components/workspace/workspace-record-sheet";
import { requireActiveOrganization } from "@/route-guards/organizations";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace")({
  component: WorkspaceLayout,
  validateSearch: z.object({
    workspaceId: z.string().min(1).max(200).optional(),
    contactId: z.uuid().optional(),
    interactionId: z.uuid().optional(),
  }),
  beforeLoad: async ({ context }) => {
    const { organizationId } = await requireActiveOrganization(
      context.queryClient,
      context.session.session.activeOrganizationId,
    );
    return { organizationId };
  },
});

function WorkspaceLayout() {
  const { organizationId } = Route.useRouteContext();
  const { workspaceId, contactId, interactionId } = Route.useSearch();
  return (
    <WorkspaceLinkBoundary organizationId={organizationId} workspaceId={workspaceId}>
      <WorkspaceRecordSheet
        organizationId={organizationId}
        contactId={contactId}
        interactionId={interactionId}
      >
        <Outlet />
      </WorkspaceRecordSheet>
    </WorkspaceLinkBoundary>
  );
}
