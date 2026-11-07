import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCallback } from "react";

import {
  InvitationManager as InvitationManagerView,
  type InvitationRole,
} from "@/components/organizations/invitations/invitation-manager-view";
import { useCurrentTime } from "@/hooks/use-current-time";
import { authClient } from "@/lib/auth/client";
import { queryKeys } from "@/queries/keys";
import { invitationsQueryOptions } from "@/queries/organizations/invitations";

export function InvitationManager({ organizationId }: { organizationId: string }) {
  const now = useCurrentTime();
  const invitations = useQuery(invitationsQueryOptions(organizationId));
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.organization(organizationId) });
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
      if (result.error) throw new Error(result.error.message || "Could not send the invitation.");
    },
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.cancelInvitation({ invitationId });
      if (result.error) throw new Error(result.error.message || "Could not cancel the invitation.");
    },
    onSuccess: refresh,
  });
  const { mutate: sendInvite, reset: resetInvite } = invite;
  const { mutate: cancelInvite, reset: resetCancel } = cancel;
  const onInvite = useCallback(
    (email: string, role: InvitationRole, resend?: boolean) => {
      resetCancel();
      sendInvite({ email, role, resend });
    },
    [resetCancel, sendInvite],
  );
  const onCancel = useCallback(
    (id: string) => {
      resetInvite();
      cancelInvite(id);
    },
    [resetInvite, cancelInvite],
  );
  let message: string | undefined;
  if (invite.isSuccess) message = "Invitation email sent.";
  else if (cancel.isSuccess) message = "Invitation canceled.";
  return (
    <InvitationManagerView
      invitations={invitations.data?.map((invitation) => ({
        ...invitation,
        expired: new Date(invitation.expiresAt).getTime() < now,
      }))}
      loading={invitations.isPending}
      sending={invite.isPending}
      canceling={cancel.isPending}
      error={invite.error || cancel.error}
      loadError={invitations.error}
      message={message}
      onRetry={() => void invitations.refetch()}
      onInvite={onInvite}
      onCancel={onCancel}
    />
  );
}
