import { useQuery } from "@tanstack/react-query";

import { UserInvitationsTable } from "./user-invitations-table";
import { SettingsPanel } from "@/components/layout/settings-page";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { userInvitationsQueryOptions } from "@/queries/organizations/invitations";

export function UserInvitations() {
  const invitations = useQuery(userInvitationsQueryOptions());
  const now = useExpiryTime(invitations.data?.map((item) => item.expiresAt));
  return (
    <SettingsPanel
      title="Your invitations"
      description="Invitations to join other workspaces, sent to your email address."
    >
      <UserInvitationsTable
        invitations={invitations.data?.map((item) => ({
          ...item,
          href: `/accept-invitation/${encodeURIComponent(item.id)}`,
        }))}
        now={now}
        loading={invitations.isPending}
        error={invitations.error}
        onRetry={() => void invitations.refetch()}
      />
    </SettingsPanel>
  );
}
