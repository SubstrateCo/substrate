import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authError } from "@/api/auth/error";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import {
  InvitationManager as InvitationManagerView,
  type InvitationRole,
} from "@/components/organizations/invitations/invitation-manager-view";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { authClient } from "@/lib/auth/client";
import { queryKeys } from "@/queries/keys";
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
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.invitations(organizationId) });
  const invite = useMutation({
    mutationFn: async ({
      email,
      role,
      resend = false,
    }: {
      email: string;
      role: InvitationRole;
      resend?: boolean;
    }) => {
      const result = await authClient.organization.inviteMember({
        organizationId,
        email,
        role,
        resend,
      });
      if (result.error) throw authError(result.error);
    },
    onSuccess: async (_, { resend }) => {
      toast.success(resend ? "Invitation email resent." : "Invitation email sent.");
      await refresh();
    },
    onError: (error, { resend }) => {
      if (resend)
        toast.error(
          actionErrorMessage(error, "We couldn’t resend this invitation. Please try again."),
        );
    },
  });
  const cancel = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.cancelInvitation({ invitationId });
      if (result.error) throw authError(result.error);
    },
    onSuccess: async () => {
      toast.success("Invitation canceled.");
      await refresh();
    },
    onError: (error) =>
      toast.error(
        actionErrorMessage(error, "We couldn’t cancel this invitation. Please try again."),
      ),
  });
  const { mutate: sendInvite, reset: resetInvite } = invite;
  const { mutate: cancelInvite, reset: resetCancel } = cancel;
  const onInvite = (email: string, role: InvitationRole, resend?: boolean) => {
    resetCancel();
    sendInvite({ email, role, resend });
  };
  const onCancel = (id: string) => {
    resetInvite();
    cancelInvite(id);
  };
  return (
    <InvitationManagerView
      framed={framed}
      invitations={invitations.data?.map((invitation) => ({
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
