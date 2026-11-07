import { Composer } from "../composer/composer";
import { MessageItem } from "../messages/message-item";
import { MessageList } from "../messages/message-list";
import { useMessageHistory } from "../messages/use-message-history";
import type { Message } from "@/api/messaging/requests";
import { MessageHistory } from "@/components/messaging/messages/message-history";
import { ThreadPane as ThreadPaneView } from "@/components/messaging/threads/thread-pane-view";

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
  const {
    messages: replies,
    history,
    loadOlder,
  } = useMessageHistory({
    organizationId,
    conversationId,
    threadId,
    aroundMessageId: targetMessage?.threadId ? targetMessage.id : undefined,
  });
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
          <MessageHistory replies {...history} onOlder={() => loadOlder(rows[0]!.id)}>
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
