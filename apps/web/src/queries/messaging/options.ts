import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/queries/keys";
import { listConversations, listMessages } from "@/api/messaging";

export const conversationsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.conversations(organizationId),
    queryFn: async ({ signal }) => {
      return listConversations({ data: { organizationId }, signal });
    },
    refetchInterval: 5000,
    retry: false,
  });

export const messagesQueryOptions = (
  organizationId: string,
  conversationId: string,
  threadId?: string,
  options: { beforeMessageId?: string; aroundMessageId?: string } = {},
) =>
  queryOptions({
    queryKey: [...queryKeys.messages(organizationId, conversationId, threadId), options],
    queryFn: async ({ signal }) => {
      return listMessages({
        data: { organizationId, conversationId, threadId, ...options },
        signal,
      });
    },
    refetchInterval: 3000,
    retry: false,
  });
