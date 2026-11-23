import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { markConversationRead, unreadCounts } from "@/api/messaging/read-state";
import { queryKeys } from "@/queries/keys";

export const unreadCountsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.messageUnread(organizationId),
    queryFn: ({ signal }) => unreadCounts({ data: { organizationId }, signal }),
    retry: false,
  });

/**
 * The conversation's first unread timeline message when it opened, or `null` when nothing was
 * unread. It stays the same while the conversation is open, so the "New" divider does not move as
 * the read position does. Mark the conversation read only once `ready` is true.
 */
export function useOpeningUnread(organizationId: string, conversationId: string) {
  const unread = useQuery(unreadCountsOptions(organizationId));
  const [opening, setOpening] = useState<{ conversationId: string; messageId: string | null }>();
  if (opening?.conversationId === conversationId)
    return { ready: true, messageId: opening.messageId };
  // A failed count shows no divider; it must not keep the conversation unread.
  if (unread.isPending) return { ready: false, messageId: null };
  const messageId =
    unread.data?.find((row) => row.conversationId === conversationId)?.firstUnreadMessageId ?? null;
  setOpening({ conversationId, messageId });
  return { ready: true, messageId };
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
