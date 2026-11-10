import { useMutation, useQuery } from "@tanstack/react-query";

import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { isInvitationUnavailable } from "@/components/feedback/request-failure";
import { AcceptInvitationScreen as AcceptInvitationScreenView } from "@/components/organizations/invitations/accept-invitation-screen-view";
import { InvitationAcceptedView } from "@/components/organizations/invitations/invitation-accepted-view";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { authClient } from "@/lib/auth/client";
import { activateOrganization } from "@/lib/auth/organization";
import { unwrap } from "@/lib/auth/result";
import { isDesktop } from "@/lib/desktop/auth";
import { invitationQueryOptions } from "@/queries/organizations/invitations";

export function AcceptInvitationScreen({ invitationId }: { invitationId: string }) {
  const invitation = useQuery(invitationQueryOptions(invitationId));
  const now = useExpiryTime(invitation.data ? [invitation.data.expiresAt] : undefined);
  const activate = useMutation({
    mutationFn: (organizationId: string) =>
      activateOrganization(organizationId, isDesktop() ? "/dashboard" : "/setup/complete"),
  });
  const accept = useMutation({
    mutationFn: async () =>
      unwrap(await authClient.organization.acceptInvitation({ invitationId })),
    onSuccess: (result) => activate.mutate(result.member.organizationId),
  });
  const available =
    !!invitation.data &&
    new Date(invitation.data.expiresAt).getTime() >= now &&
    invitation.data.status === "pending";
  const accepted = accept.data;
  if (accepted) {
    return (
      <InvitationAcceptedView
        pending={activate.isPending}
        error={activate.error}
        onContinue={() => activate.mutate(accepted.member.organizationId)}
      />
    );
  }
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
      signOut={
        <SignOutButton destination={`/accept-invitation/${encodeURIComponent(invitationId)}`} />
      }
      workspacesHref="/organizations"
    />
  );
}
