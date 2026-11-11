import { useMutation, useQueryClient } from "@tanstack/react-query";

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
import { activateOrganization } from "@/lib/auth/organization";

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

export function useAcceptSharingInvitation(invitationId: string, organizationId: string) {
  return useMutation({
    mutationFn: () =>
      acceptSharingInvitation({ data: { invitationId, organizationId, shareHistory: true } }),
  });
}

export function useDeclineSharingInvitation(invitationId: string) {
  return useMutation({
    mutationFn: () => declineSharingInvitation({ data: { invitationId } }),
  });
}

export function useActivateSharingOrganization() {
  return useMutation({
    mutationFn: ({
      organizationId,
      destination,
    }: {
      organizationId: string;
      destination: string;
    }) => activateOrganization(organizationId, destination),
  });
}
