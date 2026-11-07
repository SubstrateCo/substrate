import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceSettings } from "@/components/organizations/settings/organization-settings";

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
