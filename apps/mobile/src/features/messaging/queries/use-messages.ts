import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useEffect } from "react";
import { AppState } from "react-native";

import { getMessagePage, getMessageTarget } from "../api/context";
import { markConversationRead } from "../api/conversations";
import { listMessages, type MessagePageQuery } from "../api/messages";
import { messagingKeys } from "../keys";
import { timelineFromPages } from "../messages/message-rows";
import { messagePageSize } from "../messages/pagination";
import { useMessagingScope } from "../scope";
import type { MessageContext } from "../types";
import { latestHistoryKey } from "./new-messages";

export function useMessageHistory(
  organizationId: string,
  conversationId: string,
  threadId?: string,
  aroundMessageId?: string,
) {
  const scope = useMessagingScope(organizationId);
  const query = useInfiniteQuery({
    queryKey: aroundMessageId
      ? [...messagingKeys.messages(scope, conversationId, threadId), aroundMessageId]
      : latestHistoryKey(scope, { conversationId, threadId }),
    // SAFETY: the first page has no cursor; later cursors are message IDs.
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const page: MessagePageQuery = {
        organizationId: scope.organizationId,
        conversationId,
        threadId,
      };
      if (pageParam) page.beforeMessageId = pageParam;
      else if (aroundMessageId) page.aroundMessageId = aroundMessageId;
      return listMessages(page, signal);
    },
    getNextPageParam: (page) => (page.length === messagePageSize ? page[0]?.id : undefined),
    retry: false,
  });
  const pages = query.data?.pages ?? [];
  return {
    query,
    pages,
    messages: timelineFromPages(pages).filter((message) => message.id !== threadId),
  };
}

export function useMessageTarget(
  organizationId: string,
  conversationId: string | undefined,
  messageId: string | undefined,
) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.target(scope, conversationId ?? "", messageId ?? ""),
    queryFn:
      conversationId && messageId
        ? ({ signal }) =>
            getMessageTarget(
              { organizationId: scope.organizationId, conversationId, messageId },
              signal,
            )
        : skipToken,
    retry: false,
  });
}

export function useThreadRoot(organizationId: string, conversationId: string, threadId: string) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.threadRoot(scope, conversationId, threadId),
    queryFn: async ({ signal }) => {
      const page = await listMessages(
        { organizationId: scope.organizationId, conversationId, aroundMessageId: threadId },
        signal,
      );
      const root = page.find((message) => message.id === threadId);
      if (!root) throw new Error("This thread is no longer available.");
      return root;
    },
    retry: false,
  });
}

export function useMessageContexts(
  organizationId: string,
  conversationId: string,
  pages: readonly (readonly { id: string }[])[],
) {
  const scope = useMessagingScope(organizationId);
  const results = useQueries({
    queries: pages.flatMap((page) => {
      if (!page.length) return [];
      const messageIds = page.map((message) => message.id);
      return [
        {
          queryKey: messagingKeys.context(scope, conversationId, messageIds),
          queryFn: ({ signal }: { signal: AbortSignal }) =>
            getMessagePage({ organizationId: scope.organizationId, messageIds }, signal),
          retry: false,
        },
      ];
    }),
  });
  const byMessage = new Map<string, MessageContext>();
  for (const result of results)
    for (const row of result.data ?? []) byMessage.set(row.messageId, row);
  return {
    byMessage,
    loading: results.some((result) => result.isPending),
    error: results.find((result) => result.error)?.error ?? null,
    retry: () => results.forEach((result) => void result.refetch()),
  };
}

export function useMarkRead(
  organizationId: string,
  conversationId: string,
  latestMessageId: string | undefined,
) {
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: (messageId: string) =>
      markConversationRead({ organizationId, conversationId, messageId }),
    onSuccess: () => client.invalidateQueries({ queryKey: messagingKeys.unread(scope) }),
  });
  useEffect(() => {
    if (!latestMessageId) return;
    let state: "idle" | "pending" | "saved" = "idle";
    const read = () => {
      if (state !== "idle" || AppState.currentState !== "active") return;
      state = "pending";
      mutate(latestMessageId, {
        onSuccess: () => {
          state = "saved";
        },
        onError: () => {
          state = "idle";
        },
      });
    };
    read();
    const subscription = AppState.addEventListener("change", read);
    return () => subscription.remove();
  }, [mutate, latestMessageId]);
}
