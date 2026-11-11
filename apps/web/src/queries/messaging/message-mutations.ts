import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteMessage, editMessage, removeMember } from "@/api/messaging/requests";
import { queryKeys } from "@/queries/keys";

export function useMessageMutations(organizationId: string, messageId: string) {
  const client = useQueryClient();
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
      client.invalidateQueries({ queryKey: queryKeys.context(organizationId) }),
    ]);
  return {
    edit: useMutation({
      mutationFn: (body: string) => editMessage({ data: { organizationId, messageId, body } }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: () => deleteMessage({ data: { organizationId, messageId } }),
      onSuccess: invalidate,
    }),
  };
}

export function useRemoveMember(organizationId: string, conversationId: string, actorId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => removeMember({ data: { organizationId, conversationId, actorId } }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) }),
        client.invalidateQueries({ queryKey: queryKeys.context(organizationId) }),
      ]),
  });
}
