import { useQuery } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { queryKeys } from "@/queries/keys";
import { messagesQueryOptions } from "@/queries/messaging/options";

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
  const [beforeMessageId, setBeforeMessageId] = useState<string>();
  const [historyRequest, setHistoryRequest] = useState<"older" | "latest">();
  const messages = useQuery({
    ...messagesQueryOptions(organizationId, conversationId, threadId, {
      beforeMessageId,
      aroundMessageId,
    }),
    placeholderData: (previous, query) =>
      queryKeys
        .messages(organizationId, conversationId, threadId)
        .every((part, index) => query?.queryKey[index] === part)
        ? previous
        : undefined,
  });
  let pending: "older" | "latest" | "refresh" | undefined;
  if (messages.isFetching) pending = historyRequest ?? "refresh";
  useEffect(() => {
    if (messages.isFetching) return () => setHistoryRequest(undefined);
  }, [messages.isFetching]);

  return {
    messages,
    history: {
      pending,
      hasOlder: messages.data?.length === 50,
      hasPrevious: !!beforeMessageId || pending === "latest",
      onLatest: () => {
        setHistoryRequest("latest");
        setBeforeMessageId(undefined);
      },
    },
    loadOlder: (messageId: string | undefined) => {
      setHistoryRequest("older");
      setBeforeMessageId(messageId);
    },
  };
}
