import { createFileRoute, Outlet } from "@tanstack/react-router";

import { UserSettingsLayout } from "@/components/settings/user-settings-layout";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";

export const Route = createFileRoute("/_authenticated/settings/user")({
  component: UserSettingsRoute,
});

function UserSettingsRoute() {
  const { session } = Route.useRouteContext();
  return (
    <WorkspaceFrame organizationId={session.session.activeOrganizationId} name={session.user.name}>
      <UserSettingsLayout>
        <Outlet />
      </UserSettingsLayout>
    </WorkspaceFrame>
  );
}
