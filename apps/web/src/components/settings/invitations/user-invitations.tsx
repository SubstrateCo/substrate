import { useQuery } from "@tanstack/react-query";

import { UserInvitationsTable } from "./user-invitations-table";
import { SettingsPanel } from "@/components/layout/settings-page";
import { useDeclineInvitationConfirm } from "@/components/organizations/invitations/use-decline-invitation";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { resourceState } from "@/lib/resource-state";
import { userInvitationsQueryOptions } from "@/queries/organizations/invitations";

export function UserInvitations() {
  const invitations = useQuery(userInvitationsQueryOptions());
  const now = useExpiryTime(invitations.data?.map((item) => item.expiresAt));
  const decline = useDeclineInvitationConfirm();
  return (
    <SettingsPanel
      title="Your invitations"
      description="Invitations to join other workspaces, sent to your email address."
    >
      <UserInvitationsTable
        invitations={resourceState(invitations).data}
        now={now}
        loading={invitations.isPending}
        error={invitations.error}
        onRetry={() => void invitations.refetch()}
        decliningId={decline.pendingId}
        onDecline={decline.request}
      />
      {decline.dialog}
    </SettingsPanel>
  );
}
