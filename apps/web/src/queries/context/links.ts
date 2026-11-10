import { keepPreviousData, queryOptions, replaceEqualDeep } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  getMessagePage,
  getRelatedContext,
  getMessageTarget,
  type MessagePageContext,
} from "@/api/context/links";

export const messagePageOptions = (
  organizationId: string,
  conversationId: string,
  messageIds: string[],
) =>
  queryOptions({
    queryKey: [...queryKeys.messagePages(organizationId, conversationId), messageIds],
    queryFn: async ({ signal, client }) => {
      const page = await getMessagePage({ data: { organizationId, messageIds }, signal });
      // Each new message changes the key. Reuse the conversation's cached rows that still equal
      // the fresh ones, so unchanged messages keep their objects and do not render again.
      const cached = new Map(
        client
          .getQueriesData<MessagePageContext[]>({
            queryKey: queryKeys.messagePages(organizationId, conversationId),
          })
          .flatMap(([, rows]) => rows ?? [])
          .map((row) => [row.messageId, row]),
      );
      return page.map((row) => replaceEqualDeep(cached.get(row.messageId), row));
    },
    // Each new message changes the key. Keep visible rows' context while the new page loads.
    placeholderData: keepPreviousData,
    enabled: messageIds.length > 0,
    retry: false,
  });

export const relatedContextOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: queryKeys.related(organizationId, entityId),
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
