import { useMutation, useQuery } from "@tanstack/react-query";

import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { isInvitationUnavailable } from "@/components/feedback/request-failure";
import { AcceptInvitationScreen as AcceptInvitationScreenView } from "@/components/organizations/invitations/accept-invitation-screen-view";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { authClient } from "@/lib/auth/client";
import { activateOrganization } from "@/lib/auth/organization";
import { unwrap } from "@/lib/auth/result";
import { invitationQueryOptions } from "@/queries/organizations/invitations";

export function AcceptInvitationScreen({ invitationId }: { invitationId: string }) {
  const invitation = useQuery(invitationQueryOptions(invitationId));
  const now = useExpiryTime(invitation.data ? [invitation.data.expiresAt] : undefined);
  const accept = useMutation({
    mutationFn: async () => {
      const result = unwrap(await authClient.organization.acceptInvitation({ invitationId }));
      await activateOrganization(result.member.organizationId);
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
