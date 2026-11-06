import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  getMessageLinks,
  getMessagePeople,
  getRelatedContext,
  getMessageTarget,
  getActivity,
  getNotifications,
  searchContext,
} from "@/api/context";

export const messageLinksOptions = (organizationId: string, messageId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "message", messageId],
    queryFn: ({ signal }) => getMessageLinks({ data: { organizationId, messageId }, signal }),
    refetchInterval: 5000,
    retry: false,
  });
export const messagePeopleOptions = (organizationId: string, messageId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "people", messageId],
    queryFn: ({ signal }) => getMessagePeople({ data: { organizationId, messageId }, signal }),
    refetchInterval: 5000,
    retry: false,
  });
export const relatedContextOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "related", entityId],
    queryFn: ({ signal }) => getRelatedContext({ data: { organizationId, entityId }, signal }),
    refetchInterval: 5000,
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
    refetchInterval: 5000,
    retry: false,
  });
export const activityOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "activity", entityId],
    queryFn: ({ signal }) => getActivity({ data: { organizationId, entityId }, signal }),
    refetchInterval: 5000,
    retry: false,
  });
export const notificationsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "notifications"],
    queryFn: ({ signal }) => getNotifications({ data: { organizationId }, signal }),
    refetchInterval: 5000,
    retry: false,
  });
export type SearchInput = Parameters<typeof searchContext>[0]["data"];
export const searchOptions = (input: SearchInput) =>
  queryOptions({
    queryKey: [...queryKeys.context(input.organizationId), "search", input],
    queryFn: ({ signal }) => searchContext({ data: input, signal }),
    retry: false,
  });
