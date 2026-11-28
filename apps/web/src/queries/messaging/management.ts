import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { forgetRemovedConversation, invalidateRemovedConversation } from "./mutations";
import {
  deleteConversation,
  joinConversation,
  leaveConversation,
  transferOwnership,
} from "@/api/messaging/requests";

export function useConversationManagement(
  organizationId: string,
  onRemoved?: (conversationId: string) => Promise<void> | void,
) {
  const client = useQueryClient();
  const removed = async (conversationId: string) => {
    forgetRemovedConversation(client, organizationId, conversationId);
    await onRemoved?.(conversationId);
    await invalidateRemovedConversation(client, organizationId, conversationId);
  };
  const refreshLists = () =>
    client.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) });
  return {
    remove: useMutation({
      mutationFn: (conversationId: string) =>
        deleteConversation({ data: { organizationId, conversationId } }),
      onSuccess: (_, conversationId) => removed(conversationId),
    }),
    leave: useMutation({
      mutationFn: (input: { conversationId: string; newOwnerUserId?: string }) =>
        leaveConversation({ data: { organizationId, ...input } }),
      onSuccess: (_, input) => removed(input.conversationId),
    }),
    transfer: useMutation({
      mutationFn: (input: { conversationId: string; userId: string }) =>
        transferOwnership({ data: { organizationId, ...input } }),
      onSuccess: refreshLists,
    }),
    join: useMutation({
      mutationFn: (conversationId: string) =>
        joinConversation({ data: { organizationId, conversationId } }),
      onSuccess: refreshLists,
    }),
  };
}
