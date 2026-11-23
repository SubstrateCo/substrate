import { createFileRoute, Outlet } from "@tanstack/react-router";

import { WorkspaceContactSheet } from "@/components/contacts/workspace-contact-sheet";
import { WorkspaceLinkBoundary } from "@/components/workspace/workspace-link-boundary";
import { requireActiveOrganization } from "@/route-guards/organizations";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace")({
  component: WorkspaceLayout,
  validateSearch: z.object({
    workspaceId: z.string().min(1).max(200).optional(),
    contactId: z.uuid().optional(),
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
  const { workspaceId, contactId } = Route.useSearch();
  return (
    <WorkspaceLinkBoundary organizationId={organizationId} workspaceId={workspaceId}>
      <WorkspaceContactSheet organizationId={organizationId} contactId={contactId}>
        <Outlet />
      </WorkspaceContactSheet>
    </WorkspaceLinkBoundary>
  );
}
