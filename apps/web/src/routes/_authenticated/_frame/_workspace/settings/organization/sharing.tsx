import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSharing } from "@/components/organizations/settings/organization-sharing";

export const Route = createFileRoute(
  "/_authenticated/_frame/_workspace/settings/organization/sharing",
)({
  component: Section,
});

function Section() {
  const { organizationSettings } = Route.useRouteContext();
  return <OrganizationSharing organizationId={organizationSettings.organizationId} />;
}
