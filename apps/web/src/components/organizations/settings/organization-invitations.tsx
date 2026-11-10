import { ContentNotice } from "@/components/feedback/content-notice";
import { SettingsPanel } from "@/components/layout/settings-page";
import { InvitationManager } from "@/components/organizations/invitations/invitation-manager";
import { LockKeyhole } from "lucide-react";

export function OrganizationInvitations({
  organizationId,
  isOwner,
}: {
  organizationId: string;
  isOwner: boolean;
}) {
  return (
    <SettingsPanel title="Invitations" description="Bring new people into this organization.">
      {isOwner ? (
        <InvitationManager organizationId={organizationId} framed />
      ) : (
        <div className="rounded-xl border">
          <ContentNotice
            icon={LockKeyhole}
            title="Only owners can invite people"
            description="Ask an owner of this organization to send the invitation."
          />
        </div>
      )}
    </SettingsPanel>
  );
}
