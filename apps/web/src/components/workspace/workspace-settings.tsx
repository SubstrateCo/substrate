import { WorkspaceSettings as WorkspaceSettingsView } from "@startup-os/ui/workspace/workspace-settings";
import { InvitationManager } from "@/components/organizations/invitation-manager";

export function WorkspaceSettings({
  organizationId,
  isOwner,
}: {
  organizationId: string;
  isOwner: boolean;
}) {
  return (
    <WorkspaceSettingsView>
      {isOwner && <InvitationManager organizationId={organizationId} />}
    </WorkspaceSettingsView>
  );
}
