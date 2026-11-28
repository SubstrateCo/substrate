import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { invalidateAddedMembers } from "./mutations";
import { addAgent, removeAgent } from "@/api/messaging/requests";

export function useConversationAgents(organizationId: string, conversationId: string) {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      invalidateAddedMembers(client, organizationId, conversationId),
      client.invalidateQueries({ queryKey: queryKeys.search(organizationId) }),
    ]);
  return {
    add: useMutation({
      mutationFn: (agentId: string) =>
        addAgent({ data: { organizationId, conversationId, agentId } }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (actorId: string) =>
        removeAgent({ data: { organizationId, conversationId, actorId } }),
      onSuccess: refresh,
    }),
  };
}
