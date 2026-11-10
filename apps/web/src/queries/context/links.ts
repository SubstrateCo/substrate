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
    queryFn: async ({ signal, client, queryKey }) => {
      // Each new message changes the key. Rows of messages already loaded in this conversation
      // are reused, so only the new IDs are requested and unchanged rows keep their objects.
      // Invalidated pages are skipped: invalidation means their context changed. A page that
      // already has data is refetching, so it requests every ID.
      const refetch = client.getQueryData(queryKey) !== undefined;
      const rowsOf = (usable: boolean) =>
        new Map(
          client
            .getQueriesData<MessagePageContext[]>({
              queryKey: queryKeys.messagePages(organizationId, conversationId),
              predicate: ({ state }) =>
                usable ? !refetch && state.status === "success" && !state.isInvalidated : true,
            })
            // Overlapping pages can refresh in a different order from their insertion order.
            // Let the newest page win when several pages contain the same message.
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
          ? await getMessagePage({ data: { organizationId, messageIds: missing }, signal })
          : []
        ).map((row) => [row.messageId, replaceEqualDeep(previous.get(row.messageId), row)]),
      );
      return messageIds.flatMap((id) => {
        const row = cached.get(id) ?? fetched.get(id);
        return row ? [row] : [];
      });
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
