import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { isInvitationUnavailable } from "@/api/access-failure";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { AcceptInvitationScreen as AcceptInvitationScreenView } from "@/components/organizations/invitations/accept-invitation-screen-view";
import { InvitationAcceptedView } from "@/components/organizations/invitations/invitation-accepted-view";
import { useDeclineInvitationConfirm } from "@/components/organizations/invitations/use-decline-invitation";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { isDesktop } from "@/lib/desktop/auth";
import { invitationScreenState } from "@/lib/organizations/invitations";
import { sessionQueryOptions } from "@/queries/auth/session";
import { invitationQueryOptions } from "@/queries/organizations/invitations";
import {
  useActivateOrganization,
  useAcceptInvitation,
} from "@/queries/organizations/selection-mutations";

export function AcceptInvitationScreen({ invitationId }: { invitationId: string }) {
  const invitation = useQuery(invitationQueryOptions(invitationId));
  const session = useQuery({ ...sessionQueryOptions(), staleTime: Infinity });
  const navigate = useNavigate();
  const now = useExpiryTime(invitation.data ? [invitation.data.expiresAt] : undefined);
  const activate = useActivateOrganization(isDesktop() ? "/messages" : "/setup/complete");
  const accept = useAcceptInvitation(invitationId);
  const decline = useDeclineInvitationConfirm({
    onDeclined: () =>
      void navigate({
        to: session.data?.session.activeOrganizationId ? "/messages" : "/organizations",
      }),
  });
  const state = invitationScreenState({
    invitation: invitation.data,
    unavailable: isInvitationUnavailable(invitation.error),
    failed: invitation.isError,
    now,
  });
  const accepted = accept.data;
  const signOut = (
    <SignOutButton destination={`/accept-invitation/${encodeURIComponent(invitationId)}`} />
  );
  if (accepted) {
    return (
      <InvitationAcceptedView
        pending={activate.isPending}
        error={activate.error}
        onContinue={() => activate.mutate(accepted.member.organizationId)}
        signOut={signOut}
      />
    );
  }
  return (
    <AcceptInvitationScreenView
      state={state}
      stale={invitation.isError}
      pending={accept.isPending}
      error={accept.error}
      onRetry={() => void invitation.refetch()}
      onAccept={() =>
        accept.mutate(undefined, {
          onSuccess: (result) => activate.mutate(result.member.organizationId),
        })
      }
      declining={decline.pendingId !== undefined}
      onDecline={() =>
        decline.request({
          id: invitationId,
          organizationName: invitation.data?.organizationName,
        })
      }
      declineDialog={decline.dialog}
      signOut={signOut}
    />
  );
}
