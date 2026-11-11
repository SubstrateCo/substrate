import type { QueryClient } from "@tanstack/react-query";

import { staleSearches } from "../context/mutations";
import { queryKeys } from "../keys";
import type { getRelatedContext } from "@/api/context/links";
import type { getProject } from "@/api/tasks/requests";
import { referenceTokenPattern } from "@/components/messaging/references/reference-token";

export function invalidateDirectMessage(client: QueryClient, organizationId: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) }),
    client.invalidateQueries({ queryKey: [...queryKeys.messaging(organizationId), "profiles"] }),
  ]);
}

export function invalidateSentMessage(
  client: QueryClient,
  organizationId: string,
  conversationId: string,
  body: string,
  threadId?: string,
) {
  const referencedIds = [...body.matchAll(referenceTokenPattern)].map((match) => match[2]!);
  const relatedIds = new Set<unknown>(referencedIds);
  // Project discussion feeds include references to their tasks, even when the feed is empty.
  for (const [key, detail] of client.getQueriesData<Awaited<ReturnType<typeof getProject>>>({
    queryKey: [...queryKeys.tasks(organizationId), "project"],
  })) {
    if (detail?.tasks.some((task) => relatedIds.has(task.entityId))) relatedIds.add(key[4]);
  }
  return Promise.all([
    // The conversation list changes only when the send rejoins a channel. That send publishes an
    // unscoped messaging hint, which refreshes the list.
    client.invalidateQueries({
      queryKey: queryKeys.conversationMessages(organizationId, conversationId),
    }),
    client.invalidateQueries({
      queryKey: queryKeys.messageTargets(organizationId, conversationId),
    }),
    // Context pages stay valid: a new message cannot change the context of loaded messages and
    // gets its own page. Reference changes arrive as realtime context hints.
    client.invalidateQueries({
      queryKey: queryKeys.related(organizationId),
      predicate: ({ queryKey }) =>
        relatedIds.has(queryKeys.relatedEntityId(queryKey)) ||
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
  for (const queryKey of [
    queryKeys.conversationMessages(organizationId, conversationId),
    queryKeys.messagePages(organizationId, conversationId),
    queryKeys.messageTargets(organizationId, conversationId),
  ])
    client.removeQueries({ queryKey });
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) }),
    client.invalidateQueries({ queryKey: queryKeys.related(organizationId) }),
    client.invalidateQueries({ queryKey: queryKeys.activity(organizationId) }),
    client.invalidateQueries({ queryKey: queryKeys.notifications(organizationId) }),
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
      queryKey: queryKeys.conversationMessages(organizationId, conversationId),
    }),
  ]);
}
