import { keepPreviousData, queryOptions, replaceEqualDeep, skipToken } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  getMessagePage,
  getRecordLabels,
  getRelatedContext,
  type MessagePageContext,
} from "@/api/context/links";
import { loadMessageTarget } from "@/api/context/message-targets";

export const messagePageOptions = (
  organizationId: string,
  conversationId: string,
  messageIds: string[],
  getPage = getMessagePage,
) =>
  queryOptions({
    queryKey: queryKeys.messagePage(organizationId, conversationId, messageIds),
    queryFn: async ({ signal, client, queryKey }) => {
      const refetch = client.getQueryData(queryKey) !== undefined;
      const rowsOf = (usable: boolean) =>
        new Map(
          client
            .getQueriesData<MessagePageContext[]>({
              queryKey: queryKeys.messagePages(organizationId, conversationId),
              predicate: ({ state }) =>
                usable ? !refetch && state.status === "success" && !state.isInvalidated : true,
            })
            .sort(
              ([left], [right]) =>
                (client.getQueryState(left)?.dataUpdatedAt ?? 0) -
                (client.getQueryState(right)?.dataUpdatedAt ?? 0),
            )
            .flatMap(([, rows]) => rows ?? [])
            .map((row) => [row.messageId, row]),
        );
      const cached = rowsOf(true);
      const previous = rowsOf(false);
      const missing = messageIds.filter((id) => !cached.has(id));
      const fetched = new Map(
        (missing.length > 0
          ? await getPage({ data: { organizationId, messageIds: missing }, signal })
          : []
        ).map((row) => [row.messageId, replaceEqualDeep(previous.get(row.messageId), row)]),
      );
      return messageIds.flatMap((id) => {
        const row = cached.get(id) ?? fetched.get(id);
        return row ? [row] : [];
      });
    },
    placeholderData: keepPreviousData,
    enabled: messageIds.length > 0,
    retry: false,
  });

export const recordLabelsOptions = (organizationId: string, ids: readonly string[]) => {
  const sorted = [...new Set(ids)].sort();
  return queryOptions({
    queryKey: queryKeys.recordLabels(organizationId, sorted),
    queryFn: sorted.length
      ? ({ signal }) => getRecordLabels({ data: { organizationId, ids: sorted }, signal })
      : skipToken,
    retry: false,
  });
};

export const relatedContextOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: queryKeys.related(organizationId, entityId),
    queryFn: ({ signal }) => getRelatedContext({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
export const messageTargetOptions = (
  organizationId: string,
  conversationId: string | undefined,
  messageId: string | undefined,
  load = loadMessageTarget,
) =>
  queryOptions({
    queryKey: [...queryKeys.messageTargets(organizationId, conversationId ?? ""), messageId ?? ""],
    queryFn:
      conversationId && messageId
        ? () => load(organizationId, conversationId, messageId)
        : skipToken,
    retry: false,
  });
