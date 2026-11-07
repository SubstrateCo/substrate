import { InvitationManager } from "@/components/organizations/invitation-manager";
import { OrganizationPicture } from "@/components/organizations/organization-picture";
import { OrganizationSettings } from "@/components/workspace/organization-settings";

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
