import type { PickedRecipient } from "@substrate/contracts/people/picker";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { invalidateAddedMembers, invalidateDirectMessage } from "./mutations";
import { addMembers, createConversation } from "@/api/messaging/requests";
import { agentDirectMessage, type Conversation } from "@/lib/messaging/conversations";
import { recipientEmails } from "@/lib/people/people-picker";

type ConversationInput = Omit<
  Parameters<typeof createConversation>[0]["data"],
  "organizationId" | "kind" | "private"
> & { private?: boolean };

export function useDirectMessage(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ConversationInput & { id?: string | null }) => {
      if (id) return { id };
      if (input.agentIds?.length === 1) {
        const conversations = client.getQueryData<Conversation[]>(
          queryKeys.conversations(organizationId),
        );
        const existing = agentDirectMessage(conversations ?? [], input.agentIds[0]!);
        if (existing) return { id: existing.id };
      }
      // The server returns an existing DM with the same person instead of creating another one.
      return createConversation({ data: { ...input, organizationId, kind: "dm", private: true } });
    },
    onSuccess: (_, input) => {
      if (!input.id) return invalidateDirectMessage(client, organizationId);
    },
  });
}

export function useCreateConversation(organizationId: string, kind: Conversation["kind"]) {
  const client = useQueryClient();
  const direct = useDirectMessage(organizationId);
  const create = useMutation({
    mutationFn: (input: ConversationInput) =>
      createConversation({
        data: { ...input, organizationId, kind, private: kind !== "channel" || input.private },
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) }),
  });
  return kind === "dm" ? direct : create;
}

export function useAddMembers(organizationId: string, conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      recipients,
      shareHistory,
    }: {
      recipients: PickedRecipient[];
      shareHistory: boolean;
    }) =>
      addMembers({
        data: { organizationId, conversationId, emails: recipientEmails(recipients), shareHistory },
      }),
    onSuccess: () => invalidateAddedMembers(client, organizationId, conversationId),
  });
}
