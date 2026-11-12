import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { invalidateTargets, searchTargets } from "../targets";
import type { MessagePageContext } from "@/api/context/links";

export function staleSearches(client: QueryClient, organizationId: string) {
  return invalidateTargets(client, searchTargets(organizationId));
}

export function invalidateMessageWork(
  client: QueryClient,
  organizationId: string,
  messageId: string,
  entityId: string,
  projectEntityId: string | null,
) {
  return Promise.all([
    client.invalidateQueries({
      queryKey: queryKeys.messagePages(organizationId),
      predicate: ({ queryKey }) => queryKeys.messagePageIds(queryKey).includes(messageId),
    }),
    ...[...new Set([entityId, ...(projectEntityId ? [projectEntityId] : [])])].map((id) =>
      client.invalidateQueries({ queryKey: queryKeys.related(organizationId, id) }),
    ),
    ...(projectEntityId && entityId !== projectEntityId
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
