import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  getMessageLinks,
  getMessagePage,
  getMessagePeople,
  getRelatedContext,
  getMessageTarget,
} from "@/api/context/links";

export const messagePageOptions = (
  organizationId: string,
  conversationId: string,
  messageIds: string[],
) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "message-pages", conversationId, messageIds],
    queryFn: ({ signal }) => getMessagePage({ data: { organizationId, messageIds }, signal }),
    enabled: messageIds.length > 0,
    retry: false,
  });

export const messageLinksOptions = (organizationId: string, messageId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "message", messageId],
    queryFn: ({ signal }) => getMessageLinks({ data: { organizationId, messageId }, signal }),
    retry: false,
  });
export const messagePeopleOptions = (organizationId: string, messageId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "people", messageId],
    queryFn: ({ signal }) => getMessagePeople({ data: { organizationId, messageId }, signal }),
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
    queryKey: [...queryKeys.context(organizationId), "target", conversationId, messageId],
    queryFn: ({ signal }) =>
      getMessageTarget({ data: { organizationId, conversationId, messageId }, signal }),
    retry: false,
  });
