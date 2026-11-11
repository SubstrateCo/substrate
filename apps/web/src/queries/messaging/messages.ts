import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useRef } from "react";

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
  const request = useRef<{ id: string; body: string } | null>(null);
  return useMutation({
    mutationFn: async ({
      body,
      attachmentFileIds,
    }: {
      body: string;
      attachmentFileIds: string[];
    }) => {
      const fingerprint = JSON.stringify([body, attachmentFileIds]);
      if (!request.current || request.current.body !== fingerprint)
        request.current = { id: crypto.randomUUID(), body: fingerprint };
      return sendMessage({
        data: {
          organizationId,
          conversationId,
          threadId,
          body,
          requestId: request.current.id,
          attachmentFileIds,
        },
      });
    },
    onSuccess: (_, { body }) => {
      request.current = null;
      onSent?.();
      return invalidateSentMessage(client, organizationId, conversationId, body, threadId);
    },
  });
}
