import { createFileRoute } from "@tanstack/react-router";

import { OrganizationInvitations } from "@/components/organizations/settings/organization-invitations";

export const Route = createFileRoute(
  "/_authenticated/_frame/_workspace/settings/organization/invitations",
)({
  component: Section,
});

function Section() {
  const { organizationSettings } = Route.useRouteContext();
  return (
    <OrganizationInvitations
      organizationId={organizationSettings.organizationId}
      isOwner={organizationSettings.isOwner}
    />
  );
}
