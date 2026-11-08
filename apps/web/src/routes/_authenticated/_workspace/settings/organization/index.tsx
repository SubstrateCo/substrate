import { createFileRoute } from "@tanstack/react-router";

import { InvitationManager } from "@/components/organizations/invitations/invitation-manager";
import { OrganizationPicture } from "@/components/organizations/settings/organization-picture";
import { OrganizationSettings } from "@/components/organizations/settings/organization-settings-content";

export const Route = createFileRoute("/_authenticated/_workspace/settings/organization/")({
  component: OrganizationSettingsRoute,
});

function OrganizationSettingsRoute() {
  const { organizationSettings } = Route.useRouteContext();
  return (
    <OrganizationSettings
      isOwner={organizationSettings.isOwner}
      picture={<OrganizationPicture organizationId={organizationSettings.organizationId} />}
      invitations={<InvitationManager organizationId={organizationSettings.organizationId} />}
    />
  );
}
