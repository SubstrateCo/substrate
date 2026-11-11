import { infiniteQueryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { listReactions, toggleReaction } from "@/api/messaging/requests";
import { queryKeys } from "@/queries/keys";

export function useToggleReaction(
  organizationId: string,
  conversationId: string,
  messageId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (emoji: string) => toggleReaction({ data: { organizationId, messageId, emoji } }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.messages(organizationId, conversationId).slice(0, -1),
        }),
        client.invalidateQueries({
          queryKey: queryKeys.messageTargets(organizationId, conversationId),
        }),
        client.invalidateQueries({
          queryKey: queryKeys.messageReactions(organizationId, conversationId, messageId),
        }),
      ]),
  });
}

export const messageReactionsOptions = (
  organizationId: string,
  conversationId: string,
  messageId: string,
  emoji?: string,
) =>
  infiniteQueryOptions({
    queryKey: [
      ...queryKeys.messageReactions(organizationId, conversationId, messageId),
      emoji ?? null,
    ],
    // SAFETY: an absent cursor starts the first page; subsequent cursors are actor UUIDs.
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      listReactions({
        data: {
          organizationId,
          messageId,
          emoji,
          afterActorId: pageParam,
          limit: pageParam ? 25 : 3,
        },
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    retry: false,
  });
