import { useQuery } from "@tanstack/react-query";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import {
  InvitationManager as InvitationManagerView,
  type InvitationRole,
} from "@/components/organizations/invitations/invitation-manager-view";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { resourceState } from "@/lib/resource-state";
import { useInvitationMutations } from "@/queries/organizations/invitation-mutations";
import { invitationsQueryOptions } from "@/queries/organizations/invitations";
import { toast } from "sonner";

export function InvitationManager({
  organizationId,
  framed = false,
}: {
  organizationId: string;
  /** Show the form in a settings card under the page header. */
  framed?: boolean;
}) {
  const invitations = useQuery(invitationsQueryOptions(organizationId));
  const now = useExpiryTime(invitations.data?.map((invitation) => invitation.expiresAt));
  const { invite, cancel } = useInvitationMutations(organizationId);
  const { mutate: sendInvite, reset: resetInvite } = invite;
  const { mutate: cancelInvite, reset: resetCancel } = cancel;
  const onInvite = (email: string, role: InvitationRole, resend?: boolean) => {
    resetCancel();
    sendInvite(
      { email, role, resend },
      {
        onSuccess: () =>
          toast.success(resend ? "Invitation email resent." : "Invitation email sent."),
        onError: (error) => {
          if (resend)
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
  return (
    <InvitationManagerView
      framed={framed}
      invitations={resourceState(invitations).data?.map((invitation) => ({
        ...invitation,
        expired: new Date(invitation.expiresAt).getTime() < now,
      }))}
      loading={invitations.isPending}
      sending={invite.isPending}
      canceling={cancel.isPending}
      error={invite.variables?.resend ? undefined : invite.error}
      loadError={invitations.error}
      onRetry={() => void invitations.refetch()}
      onInvite={onInvite}
      onCancel={onCancel}
    />
  );
}
