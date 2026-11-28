import type { OrganizationRole } from "@substrate/contracts/auth/permissions";

import { useQuery } from "@tanstack/react-query";

import { isInvitationEmailFailure } from "@/api/auth/error";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { InvitationManager as InvitationManagerView } from "@/components/organizations/invitations/invitation-manager-view";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { isInvitationExpired } from "@/lib/organizations/invitations";
import { invitationRoles } from "@/lib/organizations/member-policy";
import { resourceState } from "@/lib/resource-state";
import { useInvitationLink } from "@/queries/organizations/invitation-link";
import { useInvitationMutations } from "@/queries/organizations/invitation-mutations";
import { invitationsQueryOptions } from "@/queries/organizations/invitations";
import { toast } from "sonner";

const emailFailedMessage = "Copy the invite link to share it.";

export function InvitationManager({
  organizationId,
  viewerRole,
  framed = false,
}: {
  organizationId: string;
  viewerRole: string;
  framed?: boolean;
}) {
  const invitations = useQuery({
    ...invitationsQueryOptions(organizationId),
    enabled: framed,
  });
  const now = useExpiryTime(invitations.data?.map((invitation) => invitation.expiresAt));
  const { invite, cancel } = useInvitationMutations(organizationId);
  const { mutateAsync: readInvitationLink } = useInvitationLink(organizationId);
  const { mutate: sendInvite, reset: resetInvite } = invite;
  const { mutate: cancelInvite, reset: resetCancel } = cancel;
  const onInvite = (email: string, role: OrganizationRole, resend?: boolean) => {
    resetCancel();
    sendInvite(
      { email, role, resend },
      {
        onSuccess: () =>
          toast.success(resend ? "Invitation email resent." : "Invitation email sent."),
        onError: (error) => {
          if (isInvitationEmailFailure(error))
            toast.warning(
              resend
                ? "The invitation email didn’t send."
                : "Invitation created, but the email didn’t send.",
              { description: emailFailedMessage },
            );
          else if (resend)
            toast.error(
              actionErrorMessage(error, "We couldn’t resend this invitation. Please try again."),
            );
        },
      },
    );
  };
  const onCancel = (id: string) => {
    resetInvite();
    cancelInvite(id, {
      onSuccess: () => toast.success("Invitation canceled."),
      onError: (error) =>
        toast.error(
          actionErrorMessage(error, "We couldn’t cancel this invitation. Please try again."),
        ),
    });
  };
  const onCopyLink = async (id: string) => {
    await navigator.clipboard.writeText(await readInvitationLink(id));
  };
  const inviteError =
    invite.variables?.resend || (invite.error && isInvitationEmailFailure(invite.error))
      ? undefined
      : invite.error;
  return (
    <InvitationManagerView
      framed={framed}
      roles={invitationRoles(viewerRole)}
      invitations={resourceState(invitations).data?.map((invitation) => ({
        ...invitation,
        expired: isInvitationExpired(invitation.expiresAt, now),
      }))}
      loading={invitations.isPending}
      sending={invite.isPending}
      canceling={cancel.isPending}
      error={inviteError}
      loadError={invitations.error}
      onRetry={() => void invitations.refetch()}
      onInvite={onInvite}
      onCancel={onCancel}
      onCopyLink={onCopyLink}
    />
  );
}
