import { useQuery } from "@tanstack/react-query";
import { UserInvitations as UserInvitationsView } from "@startup-os/ui/settings/user-invitations";
import { userInvitationsQueryOptions } from "@/queries/organizations/options";
import { useCurrentTime } from "@/hooks/use-current-time";

export function UserInvitations() {
  const invitations = useQuery(userInvitationsQueryOptions());
  const now = useCurrentTime();
  return (
    <UserInvitationsView
      invitations={invitations.data?.map((item) => ({
        ...item,
        href: `/accept-invitation/${encodeURIComponent(item.id)}`,
      }))}
      now={now}
      loading={invitations.isPending}
      error={invitations.error}
      onRetry={() => void invitations.refetch()}
    />
  );
}
