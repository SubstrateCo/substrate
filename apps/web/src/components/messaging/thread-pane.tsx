import { useQuery } from "@tanstack/react-query";
import { ThreadPane as ThreadPaneView } from "@startup-os/ui/messaging/thread-pane";
import type { Message } from "@/lib/messaging";
import { messagesQueryOptions } from "@/queries/messaging/options";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";
import { MessageList } from "./message-list";
import { useState } from "react";
import { Button } from "@startup-os/ui/primitives/button";

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
  const replies = useQuery(
    messagesQueryOptions(organizationId, conversationId, threadId, {
      beforeMessageId,
      aroundMessageId: targetMessage?.threadId ? targetMessage.id : undefined,
    }),
  );
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
          <>
            <div className="flex gap-2 px-4">
              {replies.data.length === 50 && (
                <Button size="xs" variant="ghost" onClick={() => setBeforeMessageId(rows[0]!.id)}>
                  Older replies
                </Button>
              )}
              {beforeMessageId && (
                <Button size="xs" variant="ghost" onClick={() => setBeforeMessageId(undefined)}>
                  Latest replies
                </Button>
              )}
            </div>
            <MessageList
              messages={rows.filter((message) => message.id !== threadId)}
              organizationId={organizationId}
            />
          </>
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
