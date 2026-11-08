import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getMessagePage, getRelatedContext, getMessageTarget } from "@/api/context/links";

export const messagePageOptions = (
  organizationId: string,
  conversationId: string,
  messageIds: string[],
) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "message-pages", conversationId, messageIds],
    queryFn: ({ signal }) => getMessagePage({ data: { organizationId, messageIds }, signal }),
    // Each new message changes the key. Keep visible rows' context while the new page loads.
    placeholderData: keepPreviousData,
    enabled: messageIds.length > 0,
    retry: false,
  });

export const relatedContextOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "related", entityId],
    queryFn: ({ signal }) => getRelatedContext({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
export const messageTargetOptions = (
  organizationId: string,
  conversationId: string,
  messageId: string,
) =>
  queryOptions({
    queryKey: [...queryKeys.messageTargets(organizationId, conversationId), messageId],
    queryFn: ({ signal }) =>
      getMessageTarget({ data: { organizationId, conversationId, messageId }, signal }),
    retry: false,
  });
