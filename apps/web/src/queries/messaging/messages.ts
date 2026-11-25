import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateSentMessage, updateSentMessageHistory } from "./mutations";
import { messagesQueryOptions } from "./options";
import { sendMessage } from "@/api/messaging/requests";
import { queryKeys } from "@/queries/keys";

const sendMessageKey = (organizationId: string, conversationId: string, threadId?: string) => [
  ...queryKeys.messages(organizationId, conversationId, threadId),
  "send",
];

/** Whether this window is sending a message to the conversation or thread. */
export function useSendingMessage(
  organizationId: string,
  conversationId: string,
  threadId?: string,
) {
  return (
    useIsMutating({
      mutationKey: sendMessageKey(organizationId, conversationId, threadId),
      exact: true,
    }) > 0
  );
}

export function useInvalidateLatestMessages(
  organizationId: string,
  conversationId: string,
  threadId?: string,
) {
  const client = useQueryClient();
  return () =>
    client.invalidateQueries({
      queryKey: messagesQueryOptions(organizationId, conversationId, threadId).queryKey,
      exact: true,
      refetchType: "none",
    });
}

export function useSendMessage(
  organizationId: string,
  conversationId: string,
  threadId?: string,
  onSent?: () => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: sendMessageKey(organizationId, conversationId, threadId),
    mutationFn: async ({
      body,
      attachmentFileIds,
      requestId,
    }: {
      body: string;
      attachmentFileIds: string[];
      requestId: string;
    }) => {
      return sendMessage({
        data: {
          organizationId,
          conversationId,
          threadId,
          body,
          requestId,
          attachmentFileIds,
        },
      });
    },
    onSuccess: (sent, { body }) => {
      onSent?.();
      return Promise.all([
        updateSentMessageHistory(client, { organizationId, conversationId, threadId }, sent.id),
        invalidateSentMessage(client, organizationId, conversationId, body, threadId),
      ]);
    },
  });
}
