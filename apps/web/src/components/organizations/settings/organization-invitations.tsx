import { ContentNotice } from "@/components/feedback/content-notice";
import { SettingsPanel } from "@/components/layout/settings-page";
import { InvitationManager } from "@/components/organizations/invitations/invitation-manager";
import { invitationRoles } from "@/lib/organizations/member-policy";
import { LockKeyhole } from "lucide-react";

export function OrganizationInvitations({
  organizationId,
  viewerRole,
}: {
  organizationId: string;
  viewerRole: string;
}) {
  return (
    <SettingsPanel title="Invitations" description="Bring new people into this organization.">
      {invitationRoles(viewerRole).length > 0 ? (
        <InvitationManager organizationId={organizationId} viewerRole={viewerRole} framed />
      ) : (
        <ContentNotice
          icon={LockKeyhole}
          title="Only owners and admins can invite people"
          description="Ask an owner or admin of this organization to send the invitation."
        />
      )}
    </SettingsPanel>
  );
}
