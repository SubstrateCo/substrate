import { useQuery } from "@tanstack/react-query";

import { UserInvitationsTable } from "./user-invitations-table";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { userInvitationsQueryOptions } from "@/queries/organizations/invitations";

export function UserInvitations() {
  const invitations = useQuery(userInvitationsQueryOptions());
  const now = useExpiryTime(invitations.data?.map((item) => item.expiresAt));
  return (
    <section className="space-y-6" aria-labelledby="user-invitations-title">
      <header className="space-y-2">
        <h2 id="user-invitations-title" className="text-lg font-semibold">
          Your invitations
        </h2>
        <p className="text-sm text-muted-foreground">
          Pending organization invitations sent to your account's email address.
        </p>
      </header>
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
    </section>
  );
}
