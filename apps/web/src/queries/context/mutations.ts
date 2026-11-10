import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import type { MessagePageContext } from "@/api/context/links";

export function staleSearches(client: QueryClient, organizationId: string) {
  return Promise.all(
    queryKeys.searches(organizationId).map((queryKey) => {
      const inflight = client
        .getQueryCache()
        .findAll({ queryKey })
        .filter((query) => query.state.fetchStatus !== "idle");
      // A completed snapshot must not erase staleness recorded during its request.
      for (const query of inflight)
        void query.promise?.then(
          () => {
            if (client.getQueryCache().get(query.queryHash) === query)
              return client.invalidateQueries({
                queryKey: query.queryKey,
                exact: true,
                refetchType: "none",
              });
          },
          () => {},
        );
      return client.invalidateQueries({ queryKey, refetchType: "none" });
    }),
  );
}

export function invalidateMessageWork(
  client: QueryClient,
  organizationId: string,
  messageId: string,
  entityId: string,
  projectEntityId: string,
) {
  return Promise.all([
    client.invalidateQueries({
      queryKey: queryKeys.messagePages(organizationId),
      predicate: ({ queryKey }) => queryKeys.messagePageIds(queryKey).includes(messageId),
    }),
    ...[...new Set([entityId, projectEntityId])].map((id) =>
      client.invalidateQueries({ queryKey: queryKeys.related(organizationId, id) }),
    ),
    ...(entityId !== projectEntityId
      ? [client.invalidateQueries({ queryKey: queryKeys.activity(organizationId, entityId) })]
      : []),
    staleSearches(client, organizationId),
  ]);
}

export function invalidateWorkLabels(
  client: QueryClient,
  organizationId: string,
  entityIds: string[],
) {
  return client.invalidateQueries({
    queryKey: queryKeys.messagePages(organizationId),
    predicate: ({ queryKey }) => {
      const matches = (links: MessagePageContext["links"]) =>
        links.some((link) => entityIds.includes(link.entityId));
      return (client.getQueryData<MessagePageContext[]>(queryKey) ?? []).some((item) =>
        matches(item.links),
      );
    },
  });
}
