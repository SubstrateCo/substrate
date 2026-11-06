import { useQuery } from "@tanstack/react-query";
import { ThreadPane as ThreadPaneView } from "@startup-os/ui/messaging/thread-pane";
import type { Message } from "@/lib/messaging";
import { messagesQueryOptions } from "@/queries/messaging/options";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";
import { MessageList } from "./message-list";
import { useEffect, useState } from "react";
import { MessageHistory } from "@startup-os/ui/messaging/message-history";
import { queryKeys } from "@/queries/keys";

export function ThreadPane({
  organizationId,
  conversationId,
  threadId,
  root,
  targetMessage,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  threadId: string;
  root?: Message;
  targetMessage?: Message;
  onClose: () => void;
}) {
  const [beforeMessageId, setBeforeMessageId] = useState<string>();
  const [historyRequest, setHistoryRequest] = useState<"older" | "latest">();
  const replies = useQuery({
    ...messagesQueryOptions(organizationId, conversationId, threadId, {
      beforeMessageId,
      aroundMessageId: targetMessage?.threadId ? targetMessage.id : undefined,
    }),
    placeholderData: (previous, query) =>
      queryKeys
        .messages(organizationId, conversationId, threadId)
        .every((part, index) => query?.queryKey[index] === part)
        ? previous
        : undefined,
  });
  let historyPending: "older" | "latest" | "refresh" | undefined;
  if (replies.isFetching) historyPending = historyRequest ?? "refresh";
  useEffect(() => {
    if (replies.isFetching) return () => setHistoryRequest(undefined);
  }, [replies.isFetching]);
  const rows = [...(replies.data ?? [])];
  if (targetMessage?.threadId === threadId && !rows.some((row) => row.id === targetMessage.id))
    rows.push(targetMessage);
  return (
    <ThreadPaneView
      loading={replies.isPending}
      error={replies.error}
      onRetry={() => void replies.refetch()}
      root={root && <MessageItem message={root} organizationId={organizationId} />}
      onClose={onClose}
      replies={
        replies.data && (
          <MessageHistory
            replies
            pending={historyPending}
            hasOlder={replies.data.length === 50}
            hasPrevious={!!beforeMessageId || historyPending === "latest"}
            onOlder={() => {
              setHistoryRequest("older");
              setBeforeMessageId(rows[0]!.id);
            }}
            onLatest={() => {
              setHistoryRequest("latest");
              setBeforeMessageId(undefined);
            }}
          >
            <MessageList
              messages={rows.filter((message) => message.id !== threadId)}
              organizationId={organizationId}
            />
          </MessageHistory>
        )
      }
      composer={
        <Composer
          organizationId={organizationId}
          conversationId={conversationId}
          threadId={threadId}
          label="Reply in thread…"
        />
      }
    />
  );
}
