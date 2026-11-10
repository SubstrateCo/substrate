import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { queryKeys } from "@/queries/keys";
import { messagesQueryOptions } from "@/queries/messaging/options";

type HistoryPosition = {
  scope: string;
  target?: string;
  aroundMessageId?: string;
  beforeMessageId?: string;
};

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
  const queryClient = useQueryClient();
  const scope = JSON.stringify([organizationId, conversationId, threadId]);
  const initialPosition: HistoryPosition = {
    scope,
    target: aroundMessageId,
    aroundMessageId,
  };
  const [position, setPosition] = useState(initialPosition);
  const current = position.scope === scope ? position : initialPosition;
  if (position.scope !== scope) setPosition(current);
  const [historyRequest, setHistoryRequest] = useState<"older" | "latest">();
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
    enabled: !!current.beforeMessageId || !!current.aroundMessageId,
  });
  if (current.target !== aroundMessageId) {
    // A thread selection is not a history cursor when its root is already loaded.
    // Consume it once so Back to latest can clear the cursor while the thread stays open.
    const missingTarget =
      aroundMessageId && !messages.data?.some((row) => row.id === aroundMessageId);
    const next = { ...current, target: aroundMessageId };
    if (missingTarget) {
      next.aroundMessageId = aroundMessageId;
      next.beforeMessageId = undefined;
    }
    setPosition(next);
  }
  const pending = messages.isFetching ? historyRequest : undefined;
  useEffect(() => {
    if (messages.isFetching) return () => setHistoryRequest(undefined);
  }, [messages.isFetching]);

  return {
    messages,
    history: {
      pending,
      hasOlder: messages.data?.length === 50,
      hasPrevious:
        pending === "latest" ||
        (!!latest.data?.length &&
          !!messages.data &&
          latest.data.at(-1)?.id !== messages.data.at(-1)?.id),
      onLatest: () => {
        void queryClient.invalidateQueries({
          queryKey: messagesQueryOptions(organizationId, conversationId, threadId).queryKey,
          exact: true,
          refetchType: "none",
        });
        setHistoryRequest("latest");
        setPosition({ ...current, beforeMessageId: undefined, aroundMessageId: undefined });
      },
    },
    loadOlder: (messageId: string | undefined) => {
      setHistoryRequest("older");
      setPosition({ ...current, beforeMessageId: messageId, aroundMessageId: undefined });
    },
  };
}
