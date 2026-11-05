import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceSettings } from "@/components/workspace/workspace-settings";

export const Route = createFileRoute("/_authenticated/_workspace/settings/organization/")({
  component: OrganizationSettingsRoute,
});

function OrganizationSettingsRoute() {
  const { organizationSettings } = Route.useRouteContext();
  return (
    <WorkspaceSettings
      organizationId={organizationSettings.organizationId}
      isOwner={organizationSettings.isOwner}
    />
  );
}
