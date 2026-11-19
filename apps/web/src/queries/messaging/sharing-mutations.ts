import { mutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  acceptSharingInvitation,
  declineSharingInvitation,
  disconnectSharing,
  inviteSharing,
  removeSharing,
  resendSharing,
  revokeSharing,
} from "@/api/messaging/sharing";
import { organizationActivationOptions } from "@/queries/organizations/selection-mutations";

type SharingAction =
  | { kind: "invite"; email: string }
  | { kind: "resend" | "revoke" | "disconnect" | "remove"; id: string };

export function useSharingAction(organizationId: string, conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: SharingAction) => {
      const base = { organizationId, conversationId };
      switch (input.kind) {
        case "invite":
          return inviteSharing({ data: { ...base, email: input.email, shareHistory: true } });
        case "resend":
          return resendSharing({ data: { organizationId, invitationId: input.id } });
        case "revoke":
          return revokeSharing({ data: { organizationId, invitationId: input.id } });
        case "disconnect":
          return disconnectSharing({ data: { ...base, partnerOrganizationId: input.id } });
        case "remove":
          return removeSharing({ data: { ...base, actorId: input.id } });
      }
    },
    onSuccess: (_, input) => {
      // Every action except remove sends an access hint to this organization, and that hint
      // resets the same queries. Remove reaches only the host organization and the members, so a
      // partner organization's manager may not get one.
      if (input.kind !== "remove") return;
      return Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) }),
        client.invalidateQueries({ queryKey: queryKeys.sharingInvitations }),
      ]);
    },
  });
}

// The screen uses the decision result immediately. Committed access hints refresh the
// invitation query through the authenticated layout, including approval by another user.
function sharingDecisionOptions<TResult>(invitationId: string, mutationFn: () => Promise<TResult>) {
  return mutationOptions({
    mutationFn,
    // Do not send competing decisions for the same invitation concurrently from this client.
    scope: { id: `sharing-invitation:${invitationId}` },
    gcTime: 0,
  });
}

export function useAcceptSharingInvitation(invitationId: string, organizationId: string) {
  return useMutation(
    sharingDecisionOptions(invitationId, () =>
      acceptSharingInvitation({ data: { invitationId, organizationId, shareHistory: true } }),
    ),
  );
}

export function useDeclineSharingInvitation(invitationId: string) {
  return useMutation(
    sharingDecisionOptions(invitationId, () =>
      declineSharingInvitation({ data: { invitationId } }),
    ),
  );
}

export function useActivateSharingOrganization() {
  return useMutation(organizationActivationOptions().openLinked);
}
