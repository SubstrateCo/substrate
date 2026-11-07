import { InvitationManager } from "@/components/organizations/invitations/invitation-manager";
import { OrganizationPicture } from "@/components/organizations/settings/organization-picture";
import { OrganizationSettings } from "@/components/organizations/settings/organization-settings-content";

export function WorkspaceSettings({
  organizationId,
  isOwner,
}: {
  organizationId: string;
  isOwner: boolean;
}) {
  return (
    <OrganizationSettings
      isOwner={isOwner}
      picture={<OrganizationPicture organizationId={organizationId} />}
      invitations={<InvitationManager organizationId={organizationId} />}
    />
  );
}
