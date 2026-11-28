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
      if (input.kind !== "remove") return;
      return Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) }),
        client.invalidateQueries({ queryKey: queryKeys.sharingInvitations }),
      ]);
    },
  });
}

function sharingDecisionOptions<TResult>(invitationId: string, mutationFn: () => Promise<TResult>) {
  return mutationOptions({
    mutationFn,
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
