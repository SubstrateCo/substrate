import type { conversationInput } from "@substrate/contracts/messaging/input";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addAgent,
  addMembers,
  createConversation,
  deleteConversation,
  getDeleteImpact,
  joinConversation,
  leaveConversation,
  removeAgent,
  removeMember,
  transferOwnership,
} from "../api/conversations";
import { agentDirectMessage } from "../conversations/conversation-rules";
import { messagingKeys } from "../keys";
import { useMessagingScope } from "../scope";
import type { Conversation } from "../types";
import type { z } from "zod";

function useRefreshMessaging(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: messagingKeys.all(scope) }),
      client.invalidateQueries({ queryKey: messagingKeys.searchAll(scope) }),
    ]);
}

export type CreateConversationInput = Omit<z.input<typeof conversationInput>, "organizationId">;

/** Creates a conversation. The server returns an existing DM instead of a second one. */
export function useCreateConversation(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  const refresh = useRefreshMessaging(organizationId);
  return useMutation({
    mutationFn: async (input: CreateConversationInput) => {
      if (input.kind === "dm" && input.agentIds?.length === 1) {
        const existing = agentDirectMessage(
          client.getQueryData<Conversation[]>(messagingKeys.conversations(scope)) ?? [],
          input.agentIds[0]!,
        );
        if (existing) return { id: existing.id };
      }
      return createConversation({
        organizationId,
        ...input,
        private: input.kind !== "channel" || input.private,
      });
    },
    onSuccess: refresh,
  });
}

export function useConversationManagement(organizationId: string, conversationId: string) {
  const refresh = useRefreshMessaging(organizationId);
  const target = { organizationId, conversationId };
  return {
    addMembers: useMutation({
      mutationFn: (input: { emails: string[]; shareHistory: boolean }) =>
        addMembers({ ...target, ...input }),
      onSuccess: refresh,
    }),
    removeMember: useMutation({
      mutationFn: (actorId: string) => removeMember({ ...target, actorId }),
      onSuccess: refresh,
    }),
    addAgent: useMutation({
      mutationFn: (agentId: string) => addAgent({ ...target, agentId }),
      onSuccess: refresh,
    }),
    removeAgent: useMutation({
      mutationFn: (actorId: string) => removeAgent({ ...target, actorId }),
      onSuccess: refresh,
    }),
    join: useMutation({ mutationFn: () => joinConversation(target), onSuccess: refresh }),
    leave: useMutation({
      mutationFn: (newOwnerUserId?: string) => leaveConversation({ ...target, newOwnerUserId }),
      onSuccess: refresh,
    }),
    transfer: useMutation({
      mutationFn: (userId: string) => transferOwnership({ ...target, userId }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: () => deleteConversation(target), onSuccess: refresh }),
  };
}

/** Joins a public channel from the browse list. */
export function useJoinChannel(organizationId: string) {
  const refresh = useRefreshMessaging(organizationId);
  return useMutation({
    mutationFn: (conversationId: string) => joinConversation({ organizationId, conversationId }),
    onSuccess: refresh,
  });
}

/** How much linked work a deletion would detach. Load it only while confirming. */
export function useDeleteImpact(organizationId: string, conversationId: string, enabled: boolean) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.deleteImpact(scope, conversationId),
    queryFn: ({ signal }) =>
      getDeleteImpact({ organizationId: scope.organizationId, conversationId }, signal),
    enabled,
    retry: false,
  });
}
