import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateSentMessage } from "./mutations";
import { messagesQueryOptions } from "./options";
import { sendMessage } from "@/api/messaging/requests";

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
    onSuccess: (_, { body }) => {
      onSent?.();
      return invalidateSentMessage(client, organizationId, conversationId, body, threadId);
    },
  });
}
