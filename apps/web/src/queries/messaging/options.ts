import { queryOptions, skipToken } from "@tanstack/react-query";

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

export const deleteImpactQueryOptions = (organizationId: string, conversationId?: string) =>
  queryOptions({
    queryKey: queryKeys.deleteImpact(organizationId, conversationId ?? ""),
    queryFn: conversationId
      ? ({ signal }) => getDeleteImpact({ data: { organizationId, conversationId }, signal })
      : skipToken,
    retry: false,
  });

export const conversationsQueryOptions = (organizationId: string, conversationId?: string) =>
  queryOptions({
    queryKey: queryKeys.conversationList(organizationId, conversationId),
    meta: { refreshError: "Couldn’t refresh conversations" },
    queryFn: ({ signal }) =>
      listConversations({ data: { organizationId, conversationId }, signal }),
    retry: false,
  });

export const messagesQueryOptions = (
  organizationId: string,
  conversationId: string | null | undefined,
  threadId?: string,
  options: { beforeMessageId?: string; aroundMessageId?: string } = {},
) =>
  queryOptions({
    queryKey: [...queryKeys.messages(organizationId, conversationId ?? "", threadId), options],
    meta: { refreshError: threadId ? "Couldn't refresh replies" : "Couldn't refresh messages" },
    queryFn: conversationId
      ? ({ signal }) =>
          listMessages({
            data: { organizationId, conversationId, threadId, ...options },
            signal,
          })
      : skipToken,
    retry: false,
  });
