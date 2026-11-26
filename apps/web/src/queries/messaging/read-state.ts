import { queryOptions, skipToken, useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { markConversationRead, unreadCounts } from "@/api/messaging/read-state";
import { queryKeys } from "@/queries/keys";
import { unreadRepliesByThread } from "@/queries/messaging/unread-replies";

export const unreadCountsOptions = (organizationId: string | null | undefined) =>
  queryOptions({
    queryKey: queryKeys.messageUnread(organizationId ?? ""),
    queryFn: organizationId
      ? ({ signal }) => unreadCounts({ data: { organizationId }, signal })
      : skipToken,
    retry: false,
  });

/**
 * The conversation's first unread timeline message when it opened, or `null` when nothing was
 * unread. It stays the same while the conversation is open, so the "New" divider does not move as
 * the read position does. Mark the conversation read only once `ready` is true.
 *
 * `unreadReplies` counts the unread replies of each thread root, from `unreadRepliesByThread`.
 */
export function useOpeningUnread(
  organizationId: string,
  conversationId: string,
  openThreadId?: string,
) {
  const unread = useQuery(unreadCountsOptions(organizationId));
  const [opening, setOpening] = useState<{
    conversationId: string;
    messageId: string | null;
    replyThreadIds: string[];
    openedThreadIds: string[];
  }>();
  const row = unread.data?.find((item) => item.conversationId === conversationId);
  if (opening?.conversationId === conversationId) {
    if (openThreadId && !opening.openedThreadIds.includes(openThreadId))
      setOpening({ ...opening, openedThreadIds: [...opening.openedThreadIds, openThreadId] });
    return {
      ready: true,
      messageId: opening.messageId,
      unreadReplies: unreadRepliesByThread({
        opening: opening.replyThreadIds,
        live: row?.unreadReplyThreadIds ?? [],
        opened: opening.openedThreadIds,
        openThreadId,
      }),
    };
  }
  // A failed count shows no divider; it must not keep the conversation unread.
  if (unread.isPending)
    return { ready: false, messageId: null, unreadReplies: new Map<string, number>() };
  const messageId = row?.firstUnreadMessageId ?? null;
  const replyThreadIds = row?.unreadReplyThreadIds ?? [];
  setOpening({
    conversationId,
    messageId,
    replyThreadIds,
    openedThreadIds: openThreadId ? [openThreadId] : [],
  });
  return {
    ready: true,
    messageId,
    unreadReplies: unreadRepliesByThread({
      opening: replyThreadIds,
      live: replyThreadIds,
      opened: [],
      openThreadId,
    }),
  };
}

// Reading a historical page or a background window does not advance the read position.
export function useConversationRead(
  organizationId: string,
  conversationId: string,
  messageId?: string,
) {
  const client = useQueryClient();
  useEffect(() => {
    if (!messageId) return;
    const controller = new AbortController();
    const state = { saved: false, pending: false };
    const read = () => {
      const foreground = document.visibilityState === "visible" && document.hasFocus();
      if (state.saved || state.pending || !foreground) return;
      state.pending = true;
      void markConversationRead({
        data: { organizationId, conversationId, messageId },
        signal: controller.signal,
      })
        .then(async () => {
          state.saved = true;
          if (!controller.signal.aborted)
            await client.invalidateQueries({ queryKey: queryKeys.messageUnread(organizationId) });
        })
        .catch(() => {})
        .finally(() => {
          state.pending = false;
        });
    };
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      controller.abort();
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [client, organizationId, conversationId, messageId]);
}
