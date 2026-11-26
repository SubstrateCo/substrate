import { useQuery } from "@tanstack/react-query";

import { useEffect, useEffectEvent, useState } from "react";

import { queryKeys } from "@/queries/keys";
import { useInvalidateLatestMessages, useSendingMessage } from "@/queries/messaging/messages";
import { historyPageSize } from "@/queries/messaging/new-messages";
import { messagesQueryOptions } from "@/queries/messaging/options";

type HistoryPosition = {
  target?: string;
  aroundMessageId?: string;
  beforeMessageId?: string;
  /** The person's last move through history, and when they made it. */
  request?: { kind: "older" | "latest"; at: number };
  /** The window an Older move left, to return to when nothing is older. */
  previous?: Pick<HistoryPosition, "aroundMessageId" | "beforeMessageId">;
  /** The oldest message: an Older move from it found nothing. */
  oldestId?: string;
};

type Rows = { id: string }[] | undefined;

export function useMessageHistory({
  organizationId,
  conversationId,
  threadId,
  aroundMessageId,
}: {
  organizationId: string;
  conversationId: string;
  threadId?: string;
  aroundMessageId?: string;
}) {
  const invalidateLatest = useInvalidateLatestMessages(organizationId, conversationId, threadId);
  // Callers key the pane by conversation and thread, so a new destination starts a new history.
  const [current, setPosition] = useState<HistoryPosition>({
    target: aroundMessageId,
    aroundMessageId,
  });
  const onOlderPage = isOlderPage(current);
  const messages = useQuery({
    ...messagesQueryOptions(organizationId, conversationId, threadId, {
      beforeMessageId: current.beforeMessageId,
      aroundMessageId: current.aroundMessageId,
    }),
    placeholderData: (previous, query) =>
      queryKeys
        .messages(organizationId, conversationId, threadId)
        .every((part, index) => query?.queryKey[index] === part)
        ? previous
        : undefined,
  });
  const latest = useQuery({
    ...messagesQueryOptions(organizationId, conversationId, threadId),
    enabled: onOlderPage,
  });
  const olderPageEmpty =
    messages.isSuccess && !messages.isPlaceholderData && messages.data.length === 0;
  const settled = settledPosition(current, {
    aroundMessageId,
    rows: messages.data,
    latestRows: latest.data,
    olderPageEmpty,
  });
  if (settled !== current) setPosition(settled);
  const pending = pendingMove(current, messages);
  const onLatest = () => {
    void invalidateLatest();
    setPosition({
      ...current,
      beforeMessageId: undefined,
      aroundMessageId: undefined,
      request: { kind: "latest", at: Date.now() },
    });
  };
  // Sending shows the newest messages, also from an older page, as in other chat apps.
  const sending = useSendingMessage(organizationId, conversationId, threadId);
  const followSend = useEffectEvent(() => {
    if (onOlderPage) onLatest();
  });
  // Move only when a send starts.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- A send starts in the mutation cache. The latest page must be invalidated before the move so it refetches on mount.
    if (sending) followSend();
  }, [sending]);

  return {
    messages,
    history: {
      pending,
      sending,
      hasOlder: hasOlderPage(messages.data, current.oldestId),
      hasPrevious: pending === "latest" || newerThanShown(latest.data, messages.data),
      onLatest,
    },
    loadOlder: (messageId: string | undefined) =>
      setPosition({
        ...current,
        beforeMessageId: messageId,
        aroundMessageId: undefined,
        request: { kind: "older", at: Date.now() },
        previous: {
          beforeMessageId: current.beforeMessageId,
          aroundMessageId: current.aroundMessageId,
        },
      }),
  };
}

function isOlderPage(position: HistoryPosition) {
  return !!position.beforeMessageId || !!position.aroundMessageId;
}

/** The position after the loaded pages and the selected message, or `current` when unchanged. */
function settledPosition(
  current: HistoryPosition,
  {
    aroundMessageId,
    rows,
    latestRows,
    olderPageEmpty,
  }: { aroundMessageId: string | undefined; rows: Rows; latestRows: Rows; olderPageEmpty: boolean },
) {
  let next = selectionPosition(current, aroundMessageId, rows) ?? current;
  // The newest page already holds a linked message, so the window around it would only cut off
  // newer messages and offer to jump back to them. Show the newest page instead.
  if (latestHoldsTarget(next, latestRows)) next = { ...next, aroundMessageId: undefined };
  // A full page can be the last one. When the next older page is empty, return to the window
  // the move left and remember its oldest message, instead of showing an empty conversation.
  if (olderPageEmpty) next = returnPosition(next) ?? next;
  return next;
}

/** The position after the selected message changes, or nothing when it has not changed. */
function selectionPosition(
  current: HistoryPosition,
  aroundMessageId: string | undefined,
  rows: Rows,
) {
  if (current.target === aroundMessageId) return undefined;
  // A thread selection is not a history cursor when its root is already loaded.
  // Consume it once so Back to latest can clear the cursor while the thread stays open.
  const missingTarget = aroundMessageId && !rows?.some((row) => row.id === aroundMessageId);
  const next = { ...current, target: aroundMessageId };
  if (missingTarget) {
    next.aroundMessageId = aroundMessageId;
    next.beforeMessageId = undefined;
  }
  return next;
}

function latestHoldsTarget(current: HistoryPosition, latestRows: Rows) {
  return (
    !!current.aroundMessageId &&
    !current.beforeMessageId &&
    !!latestRows?.some((row) => row.id === current.aroundMessageId)
  );
}

/** The window an Older move left, or nothing when the position did not come from one. */
function returnPosition(current: HistoryPosition): HistoryPosition | undefined {
  if (!current.beforeMessageId || !current.previous) return undefined;
  return {
    ...current,
    ...current.previous,
    previous: undefined,
    oldestId: current.beforeMessageId,
  };
}

/** A move is pending until its page arrives. Later background refreshes are not the person's. */
function pendingMove(
  { request }: HistoryPosition,
  messages: { isFetching: boolean; dataUpdatedAt: number },
) {
  return request && messages.isFetching && messages.dataUpdatedAt < request.at
    ? request.kind
    : undefined;
}

function hasOlderPage(rows: Rows, oldestId: string | undefined) {
  return rows?.length === historyPageSize && !rows.some((message) => message.id === oldestId);
}

function newerThanShown(latestRows: Rows, rows: Rows) {
  return !!latestRows?.length && !!rows && latestRows.at(-1)?.id !== rows.at(-1)?.id;
}
