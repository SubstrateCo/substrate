import { createFileRoute } from "@tanstack/react-router";

import { OrganizationInvitations } from "@/components/organizations/settings/organization-invitations";

export const Route = createFileRoute("/_authenticated/_frame/settings/organization/invitations")({
  component: Section,
});

function Section() {
  const { organizationSettings } = Route.useRouteContext();
  return (
    <OrganizationInvitations
      organizationId={organizationSettings.organizationId}
      viewerRole={organizationSettings.role}
    />
  );
}
