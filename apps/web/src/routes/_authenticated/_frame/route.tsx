import { createFileRoute, Outlet } from "@tanstack/react-router";

import { WorkspaceFrame } from "@/components/workspace/workspace-frame";

// The workspace and user settings share one frame, so it stays mounted between them. User
// settings also work without an active organization.
export const Route = createFileRoute("/_authenticated/_frame")({
  component: FrameLayout,
});

function FrameLayout() {
  const { session } = Route.useRouteContext();
  return (
    <WorkspaceFrame
      userId={session.user.id}
      organizationId={session.session.activeOrganizationId}
      name={session.user.name}
    >
      <Outlet />
    </WorkspaceFrame>
  );
}
