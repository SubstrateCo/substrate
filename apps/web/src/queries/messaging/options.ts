import { queryOptions } from "@tanstack/react-query";

import {
  getDeleteImpact,
  listConversations,
  listManagedConversations,
  listMessages,
} from "@/api/messaging/requests";
import { queryKeys } from "@/queries/keys";

export const managedConversationsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.managedConversations(organizationId),
    meta: { refreshError: "Couldn’t refresh conversations" },
    queryFn: ({ signal }) => listManagedConversations({ data: { organizationId }, signal }),
    retry: false,
  });

export const deleteImpactQueryOptions = (organizationId: string, conversationId: string) =>
  queryOptions({
    queryKey: queryKeys.deleteImpact(organizationId, conversationId),
    queryFn: ({ signal }) => getDeleteImpact({ data: { organizationId, conversationId }, signal }),
    retry: false,
  });

export const conversationsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.conversations(organizationId),
    meta: { refreshError: "Couldn’t refresh conversations" },
    queryFn: async ({ signal }) => {
      return listConversations({ data: { organizationId }, signal });
    },
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
    meta: { refreshError: threadId ? "Couldn’t refresh replies" : "Couldn’t refresh messages" },
    queryFn: async ({ signal }) => {
      return listMessages({
        data: { organizationId, conversationId, threadId, ...options },
        signal,
      });
    },
    retry: false,
  });
