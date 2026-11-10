import { createFileRoute } from "@tanstack/react-router";

import { SharingSettings } from "@/components/messaging/sharing/sharing-settings";
import { InvitationManager } from "@/components/organizations/invitations/invitation-manager";
import { ManagedConversations } from "@/components/organizations/settings/managed-conversations";
import { OrganizationPicture } from "@/components/organizations/settings/organization-picture";
import { OrganizationSettings } from "@/components/organizations/settings/organization-settings";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/settings/organization/")({
  component: OrganizationSettingsRoute,
});

function OrganizationSettingsRoute() {
  const { organizationSettings } = Route.useRouteContext();
  return (
    <OrganizationSettings
      isOwner={organizationSettings.isOwner}
      sharing={<SharingSettings organizationId={organizationSettings.organizationId} />}
      picture={<OrganizationPicture organizationId={organizationSettings.organizationId} />}
      invitations={<InvitationManager organizationId={organizationSettings.organizationId} />}
      conversations={<ManagedConversations organizationId={organizationSettings.organizationId} />}
    />
  );
}
