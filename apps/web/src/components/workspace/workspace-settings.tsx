import { OrganizationSettings } from "@startup-os/ui/workspace/organization-settings";
import { InvitationManager } from "@/components/organizations/invitation-manager";
import { OrganizationPicture } from "@/components/organizations/organization-picture";

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
