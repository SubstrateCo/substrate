import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import type { MessagePageContext } from "@/api/context/links";

export function staleSearches(client: QueryClient, organizationId: string) {
  return Promise.all(
    ["search", "search-pages"].map((kind) => {
      const queryKey = [...queryKeys.context(organizationId), kind];
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
  const context = queryKeys.context(organizationId);
  return Promise.all([
    client.invalidateQueries({
      queryKey: context,
      predicate: ({ queryKey }) =>
        (queryKey[3] === "message" && queryKey[4] === messageId) ||
        (queryKey[3] === "message-pages" &&
          Array.isArray(queryKey[5]) &&
          queryKey[5].includes(messageId)),
    }),
    ...[...new Set([entityId, projectEntityId])].map((id) =>
      client.invalidateQueries({ queryKey: [...context, "related", id] }),
    ),
    ...(entityId !== projectEntityId
      ? [client.invalidateQueries({ queryKey: [...context, "activity", entityId] })]
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
    queryKey: queryKeys.context(organizationId),
    predicate: ({ queryKey }) => {
      const matches = (links: MessagePageContext["links"]) =>
        links.some((link) => entityIds.includes(link.entityId));
      if (queryKey[3] === "message")
        return matches(client.getQueryData<MessagePageContext["links"]>(queryKey) ?? []);
      if (queryKey[3] === "message-pages")
        return (client.getQueryData<MessagePageContext[]>(queryKey) ?? []).some((item) =>
          matches(item.links),
        );
      return false;
    },
  });
}
