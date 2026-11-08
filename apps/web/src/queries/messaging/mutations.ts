import type { QueryClient } from "@tanstack/react-query";

import { staleSearches } from "../context/mutations";
import { queryKeys } from "../keys";
import type { getRelatedContext } from "@/api/context/links";
import type { getProject } from "@/api/tasks/requests";

export function invalidateSentMessage(
  client: QueryClient,
  organizationId: string,
  conversationId: string,
  body: string,
  threadId?: string,
) {
  const context = queryKeys.context(organizationId);
  const referencedIds = [
    ...body.matchAll(/@\[(task|project|channel|thread):([0-9a-f-]{36})\]/gi),
  ].map((match) => match[2]!);
  const relatedIds = new Set<unknown>(referencedIds);
  // Project discussion feeds include references to their tasks, even when the feed is empty.
  for (const [key, detail] of client.getQueriesData<Awaited<ReturnType<typeof getProject>>>({
    queryKey: [...queryKeys.tasks(organizationId), "project"],
  })) {
    if (detail?.tasks.some((task) => relatedIds.has(task.entityId))) relatedIds.add(key[4]);
  }
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) }),
    client.invalidateQueries({
      queryKey: queryKeys.messages(organizationId, conversationId).slice(0, -1),
    }),
    client.invalidateQueries({
      queryKey: queryKeys.messageTargets(organizationId, conversationId),
    }),
    client.invalidateQueries({ queryKey: [...context, "message-pages", conversationId] }),
    client.invalidateQueries({
      queryKey: [...context, "related"],
      predicate: ({ queryKey }) =>
        relatedIds.has(queryKey[4]) ||
        (!!threadId &&
          (client.getQueryData<Awaited<ReturnType<typeof getRelatedContext>>>(queryKey) ?? []).some(
            (item) =>
              item.conversationId === conversationId &&
              (item.threadId ?? item.messageId) === threadId,
          )),
    }),
    staleSearches(client, organizationId),
  ]);
}
