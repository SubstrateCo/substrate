import { useQuery } from "@tanstack/react-query";
import { ThreadPane as ThreadPaneView } from "@startup-os/ui/messaging/thread-pane";
import type { Message } from "@/lib/messaging";
import { messagesQueryOptions } from "@/queries/messaging/options";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";
import { MessageList } from "./message-list";

export function ThreadPane({
  organizationId,
  conversationId,
  threadId,
  root,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  threadId: string;
  root?: Message;
  onClose: () => void;
}) {
  const replies = useQuery(messagesQueryOptions(organizationId, conversationId, threadId));
  return (
    <ThreadPaneView
      loading={replies.isPending}
      error={replies.error}
      onRetry={() => void replies.refetch()}
      root={root && <MessageItem message={root} organizationId={organizationId} />}
      onClose={onClose}
      replies={
        replies.data && (
          <MessageList
            messages={replies.data.filter((message) => message.id !== threadId)}
            organizationId={organizationId}
          />
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
