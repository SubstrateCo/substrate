import { createFileRoute } from "@tanstack/react-router";

import { OrganizationApps } from "@/components/organizations/settings/organization-apps";

export const Route = createFileRoute("/_authenticated/_frame/settings/organization/apps")({
  component: AppsRoute,
});

function AppsRoute() {
  const { organizationSettings, session } = Route.useRouteContext();
  return (
    <OrganizationApps
      organizationId={organizationSettings.organizationId}
      userId={session.user.id}
    />
  );
}
