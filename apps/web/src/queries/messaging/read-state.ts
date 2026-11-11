import { queryOptions, useQueryClient } from "@tanstack/react-query";

import { useEffect } from "react";

import { markConversationRead, unreadCounts } from "@/api/messaging/read-state";
import { queryKeys } from "@/queries/keys";

export const unreadCountsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.messageUnread(organizationId),
    queryFn: ({ signal }) => unreadCounts({ data: { organizationId }, signal }),
    retry: false,
  });

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
