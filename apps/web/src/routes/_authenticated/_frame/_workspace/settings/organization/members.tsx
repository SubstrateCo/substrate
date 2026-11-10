import { createFileRoute } from "@tanstack/react-router";

import { OrganizationMembers } from "@/components/organizations/settings/members/organization-members";

export const Route = createFileRoute(
  "/_authenticated/_frame/_workspace/settings/organization/members",
)({
  component: Section,
});

function Section() {
  const { organizationSettings } = Route.useRouteContext();
  return <OrganizationMembers organizationId={organizationSettings.organizationId} />;
}
