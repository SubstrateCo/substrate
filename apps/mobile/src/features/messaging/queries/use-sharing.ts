import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acceptSharingInvitation,
  declineSharingInvitation,
  disconnectSharing,
  getSharingDetails,
  getSharingInvitation,
  inviteSharing,
  listSharingInbox,
  removeSharing,
  resendSharing,
  revokeSharing,
} from "../api/sharing";
import { messagingKeys } from "../keys";
import { useMessagingScope } from "../scope";

export type SharingAction =
  | { kind: "invite"; email: string }
  | { kind: "resend" | "revoke" | "disconnect" | "remove"; id: string };

export function useSharingDetails(organizationId: string, conversationId: string) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.sharing(scope, conversationId),
    queryFn: ({ signal }) =>
      getSharingDetails({ organizationId: scope.organizationId, conversationId }, signal),
    retry: false,
  });
}

export function useSharingAction(organizationId: string, conversationId: string) {
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (action: SharingAction): Promise<void> => {
      const target = { organizationId, conversationId };
      switch (action.kind) {
        case "invite":
          await inviteSharing({ ...target, email: action.email });
          return;
        case "resend":
          await resendSharing({ organizationId, invitationId: action.id });
          return;
        case "revoke":
          await revokeSharing({ organizationId, invitationId: action.id });
          return;
        case "disconnect":
          await disconnectSharing({ ...target, partnerOrganizationId: action.id });
          return;
        case "remove":
          await removeSharing({ ...target, actorId: action.id });
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: messagingKeys.all(scope) }),
  });
}

export function useSharingInbox(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.sharingInbox(scope),
    queryFn: ({ signal }) => listSharingInbox({ organizationId: scope.organizationId }, signal),
    retry: false,
  });
}

export function useSharingInvitation(organizationId: string, invitationId: string) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.sharingInvitation(scope, invitationId),
    queryFn: ({ signal }) => getSharingInvitation({ invitationId }, signal),
    retry: false,
  });
}

export function useSharingDecision(organizationId: string, invitationId: string) {
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: messagingKeys.all(scope) });
  const mutationScope = { id: `sharing-invitation:${invitationId}` };
  return {
    accept: useMutation({
      mutationFn: (targetOrganizationId: string) =>
        acceptSharingInvitation({ invitationId, organizationId: targetOrganizationId }),
      scope: mutationScope,
      onSuccess: refresh,
    }),
    decline: useMutation({
      mutationFn: () => declineSharingInvitation({ invitationId }),
      scope: mutationScope,
      onSuccess: refresh,
    }),
  };
}
