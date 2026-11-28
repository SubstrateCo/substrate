import type { PickedRecipient } from "@substrate/contracts/people/picker";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { invalidateAddedMembers, invalidateDirectMessage } from "./mutations";
import { addAgent, addMembers, createConversation } from "@/api/messaging/requests";
import { addConversationRecipients } from "@/lib/messaging/add-members";
import { agentDirectMessage, type Conversation } from "@/lib/messaging/conversations";

type ConversationInput = Omit<
  Parameters<typeof createConversation>[0]["data"],
  "organizationId" | "kind" | "private"
> & { private?: boolean };

export function useDirectMessage(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ConversationInput & { id?: string | null }) => {
      if (id) return { id };
      if (input.agentIds?.length === 1 && !input.emails?.length) {
        const conversations = client.getQueryData<Conversation[]>(
          queryKeys.conversations(organizationId),
        );
        const existing = agentDirectMessage(conversations ?? [], input.agentIds[0]!);
        if (existing) return { id: existing.id };
      }
      return createConversation({
        data: {
          ...input,
          organizationId,
          kind: input.agentIds?.length ? "agent_dm" : "dm",
          private: true,
        },
      });
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
  return kind === "dm" || kind === "agent_dm" ? direct : create;
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
      addConversationRecipients(recipients, {
        people: async (emails) => {
          await addMembers({
            data: { organizationId, conversationId, emails, shareHistory },
          });
        },
        agent: async (agentId) => {
          await addAgent({ data: { organizationId, conversationId, agentId } });
        },
      }),
    onSettled: () =>
      Promise.all([
        invalidateAddedMembers(client, organizationId, conversationId),
        client.invalidateQueries({ queryKey: queryKeys.search(organizationId) }),
      ]),
  });
}
