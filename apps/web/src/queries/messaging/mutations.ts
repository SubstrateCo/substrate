import type { QueryClient } from "@tanstack/react-query";

import { staleSearches } from "../context/mutations";
import { queryKeys } from "../keys";
import { appendNewMessages, type MessageLocation } from "./new-messages";
import { messagesQueryOptions } from "./options";
import type { getRelatedContext } from "@/api/context/links";
import type { listMessages } from "@/api/messaging/requests";
import type { getProject } from "@/api/tasks/requests";
import { referenceTokenPattern } from "@/lib/messaging/reference-token";

export function invalidateDirectMessage(client: QueryClient, organizationId: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) }),
    client.invalidateQueries({ queryKey: queryKeys.messagingProfiles(organizationId) }),
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
  for (const [key, detail] of client.getQueriesData<Awaited<ReturnType<typeof getProject>>>({
    queryKey: queryKeys.projectDetails(organizationId),
  })) {
    if (detail?.tasks.some((task) => relatedIds.has(task.entityId)))
      relatedIds.add(queryKeys.projectEntityId(key));
  }
  return Promise.all([
    client.invalidateQueries({
      queryKey: queryKeys.messageTargets(organizationId, conversationId),
    }),
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

export async function updateSentMessageHistory(
  client: QueryClient,
  location: MessageLocation,
  messageId: string,
  load?: typeof listMessages,
) {
  const { organizationId, conversationId, threadId } = location;
  if (
    !client.getQueryCache().find({
      queryKey: messagesQueryOptions(organizationId, conversationId, threadId).queryKey,
      exact: true,
    })
  )
    return;
  if (await appendNewMessages(client, location, { messageId, load })) return;
  await client.invalidateQueries({
    queryKey: messagesQueryOptions(organizationId, conversationId, threadId).queryKey,
    exact: true,
  });
}

export function forgetRemovedConversation(
  client: QueryClient,
  organizationId: string,
  conversationId: string,
) {
  client.setQueryData<{ id: string }[]>(queryKeys.conversationList(organizationId), (list) =>
    list?.filter((conversation) => conversation.id !== conversationId),
  );
}

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
