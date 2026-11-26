import { hashKey, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { detachWork } from "../api/context";
import {
  deleteMessage,
  editMessage,
  listMessages,
  listReactions,
  sendMessage,
  toggleReaction,
} from "../api/messages";
import { messagingKeys } from "../keys";
import { useMessagingScope } from "../scope";
import { appendNewMessages, latestHistoryKey } from "./new-messages";
import { useRefreshMessaging } from "./use-refresh-messaging";
import { queryKeys } from "@/queries/keys";

export function useSendMessage(organizationId: string, conversationId: string, threadId?: string) {
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; attachmentFileIds: string[]; requestId: string }) => {
      const message: Parameters<typeof sendMessage>[0] = {
        organizationId,
        conversationId,
        threadId,
        body: input.body,
        requestId: input.requestId,
      };
      if (input.attachmentFileIds.length) message.attachmentFileIds = input.attachmentFileIds;
      return sendMessage(message);
    },
    // Reads only the messages after the newest loaded one into the open history. When that
    // cannot bring it up to date, the history is read again with the rest of messaging.
    onSuccess: async (sent) => {
      const location = { conversationId, threadId };
      const appended = await appendNewMessages(client, scope, location, {
        messageId: sent.id,
        load: listMessages,
      });
      const history = appended ? hashKey(latestHistoryKey(scope, location)) : undefined;
      await Promise.all([
        client.invalidateQueries({
          queryKey: messagingKeys.all(scope),
          predicate: (query) => query.queryHash !== history,
        }),
        client.invalidateQueries({ queryKey: messagingKeys.searchAll(scope) }),
      ]);
    },
  });
}

export function useMessageMutations(organizationId: string, messageId: string) {
  const invalidate = useRefreshMessaging(organizationId);
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  return {
    edit: useMutation({
      mutationFn: (body: string) => editMessage({ organizationId, messageId, body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: () => deleteMessage({ organizationId, messageId }),
      onSuccess: invalidate,
    }),
    react: useMutation({
      mutationFn: (emoji: string) => toggleReaction({ organizationId, messageId, emoji }),
      onSuccess: invalidate,
    }),
    // The record's own pages list its linked messages too.
    unlink: useMutation({
      mutationFn: (entityId: string) => detachWork({ organizationId, messageId, entityId }),
      onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.workspace(scope) }),
    }),
  };
}

/** Who reacted with one emoji, a page at a time. */
export function useReactionPeople(organizationId: string, messageId: string, emoji: string) {
  const scope = useMessagingScope(organizationId);
  return useInfiniteQuery({
    queryKey: messagingKeys.reactions(scope, messageId, emoji),
    // SAFETY: the first page has no cursor; later cursors are actor IDs.
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listReactions(
        {
          organizationId: scope.organizationId,
          messageId,
          emoji,
          afterActorId: pageParam,
          limit: 25,
        },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
}
