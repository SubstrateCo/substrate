import type { QueryClient } from "@tanstack/react-query";

import { staleSearches } from "../context/mutations";
import { queryKeys } from "../keys";
import type { getRelatedContext } from "@/api/context/links";
import type { getProject } from "@/api/tasks/requests";
import { referenceTokenPattern } from "@/components/messaging/references/reference-token";

export function invalidateSentMessage(
  client: QueryClient,
  organizationId: string,
  conversationId: string,
  body: string,
  threadId?: string,
) {
  const context = queryKeys.context(organizationId);
  const referencedIds = [...body.matchAll(referenceTokenPattern)].map((match) => match[2]!);
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

// Call after leaving the conversation's route. Its history may now be unreadable or gone, so it is
// dropped instead of refetched. Task history, discussions, alerts and search can all change.
export function invalidateRemovedConversation(
  client: QueryClient,
  organizationId: string,
  conversationId: string,
) {
  const context = queryKeys.context(organizationId);
  for (const queryKey of [
    queryKeys.messages(organizationId, conversationId).slice(0, -1),
    [...context, "message-pages", conversationId],
    queryKeys.messageTargets(organizationId, conversationId),
  ])
    client.removeQueries({ queryKey });
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) }),
    client.invalidateQueries({ queryKey: [...context, "related"] }),
    client.invalidateQueries({ queryKey: [...context, "activity"] }),
    client.invalidateQueries({ queryKey: [...context, "notifications"] }),
    staleSearches(client, organizationId),
  ]);
}

export function invalidateAddedMembers(
  client: QueryClient,
  organizationId: string,
  conversationId: string,
) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) }),
    client.invalidateQueries({
      queryKey: queryKeys.messages(organizationId, conversationId).slice(0, -1),
    }),
  ]);
}
