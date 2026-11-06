import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AcceptInvitationScreen as AcceptInvitationScreenView } from "@startup-os/ui/organizations/accept-invitation-screen";
import { authClient } from "@/lib/auth-client";
import { invitationQueryOptions, unwrap } from "@/queries/organizations/options";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { isInvitationUnavailable } from "@startup-os/ui/feedback/request-failure";
import { useCurrentTime } from "@/hooks/use-current-time";

export function AcceptInvitationScreen({ invitationId }: { invitationId: string }) {
  const now = useCurrentTime();
  const invitation = useQuery(invitationQueryOptions(invitationId));
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: async () => {
      const result = unwrap(await authClient.organization.acceptInvitation({ invitationId }));
      unwrap(
        await authClient.organization.setActive({ organizationId: result.member.organizationId }),
      );
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign("/dashboard");
    },
  });
  const available =
    !!invitation.data &&
    new Date(invitation.data.expiresAt).getTime() >= now &&
    invitation.data.status === "pending";
  return (
    <AcceptInvitationScreenView
      invitation={invitation.data}
      loading={invitation.isPending}
      pending={accept.isPending}
      error={invitation.error || accept.error}
      failed={invitation.isError}
      unavailable={isInvitationUnavailable(invitation.error)}
      onRetry={() => void invitation.refetch()}
      available={available}
      onAccept={() => accept.mutate()}
      signOut={<SignOutButton />}
      workspacesHref="/organizations"
    />
  );
}
