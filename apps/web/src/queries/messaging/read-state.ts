import { queryOptions, skipToken, useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useRef, useState } from "react";

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

const leaseRenewal = 30_000;
const foreground = () => document.visibilityState === "visible" && document.hasFocus();

export function useConversationRead(
  organizationId: string,
  conversationId: string,
  messageId?: string,
  threadId?: string,
) {
  const client = useQueryClient();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const handover = useRef<{ key: string; keep: () => void }>(undefined);
  useEffect(() => {
    if (!messageId) return;
    const key = `${organizationId}:${conversationId}:${threadId ?? ""}`;
    const send = (viewing: boolean) => {
      const sent = queue.current.then(() =>
        markConversationRead({
          data: { organizationId, conversationId, threadId, messageId, viewing },
        }),
      );
      queue.current = sent.catch(() => {});
      return sent;
    };
    let holding = false;
    if (handover.current?.key === key) {
      handover.current.keep();
      holding = true;
    }
    let read = false;
    const sync = () => {
      if (!foreground()) {
        if (holding) void send(false).catch(() => {});
        holding = false;
        return;
      }
      if (!read) {
        read = true;
        send(true).then(
          ({ moved, cleared }) =>
            Promise.all([
              moved &&
                client.invalidateQueries({ queryKey: queryKeys.messageUnread(organizationId) }),
              cleared &&
                client.invalidateQueries({ queryKey: queryKeys.notifications(organizationId) }),
            ]),
          () => {
            read = false;
          },
        );
      } else if (!holding) void send(true).catch(() => {});
      holding = true;
    };
    sync();
    const renew = setInterval(() => {
      if (holding && foreground()) void send(true).catch(() => {});
      else sync();
    }, leaseRenewal);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(renew);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
      if (!holding) return;
      // The next newest message of the same timeline or thread keeps the lease. Effects for it
      // run before this microtask; otherwise the pane closed or moved, so the lease ends.
      let kept = false;
      handover.current = { key, keep: () => (kept = true) };
      queueMicrotask(() => {
        if (handover.current?.key === key) handover.current = undefined;
        if (!kept) void send(false).catch(() => {});
      });
    };
  }, [client, organizationId, conversationId, threadId, messageId]);
}
