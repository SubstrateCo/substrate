import { useQuery } from "@tanstack/react-query";

import { Composer } from "../composer/composer";
import { MessageItem } from "../messages/message-item";
import { MessageList } from "../messages/message-list";
import { useMessageHistory } from "../messages/use-message-history";
import type { Message } from "@/api/messaging/requests";
import { AgentWorkNotice } from "@/components/agent-work/agent-work-slot";
import { JumpToLatest, OlderMessages } from "@/components/messaging/messages/message-history";
import { ThreadPane as ThreadPaneView } from "@/components/messaging/threads/thread-pane-view";
import { messagePageOptions } from "@/queries/context/links";

export function ThreadPane({
  organizationId,
  conversationId,
  conversationLabel,
  threadId,
  root,
  contextMessageIds,
  targetMessage,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  conversationLabel: string;
  threadId: string;
  root?: Message;
  contextMessageIds: string[];
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
  const rows = replies.data ?? [];
  const reuseContext = !!root && contextMessageIds.includes(root.id);
  const rootMessageIds = root ? [root.id] : [];
  const rootContext = useQuery({
    ...messagePageOptions(
      organizationId,
      conversationId,
      reuseContext ? contextMessageIds : rootMessageIds,
    ),
    refetchOnMount: !reuseContext,
  });
  return (
    <ThreadPaneView
      conversationLabel={conversationLabel}
      loading={replies.isPending}
      error={replies.error}
      onRetry={() => void replies.refetch()}
      root={
        root && (
          <MessageItem
            threadRoot
            message={root}
            organizationId={organizationId}
            context={{
              data: rootContext.data?.find((row) => row.messageId === root.id),
              loading: rootContext.isPending,
              error: rootContext.error,
              onRetry: () => void rootContext.refetch(),
            }}
          />
        )
      }
      onClose={onClose}
      replies={
        replies.data && (
          <MessageList
            messages={rows.filter((message) => message.id !== threadId)}
            organizationId={organizationId}
            conversationId={conversationId}
            olderPage={history.hasPrevious}
            previousDate={root?.createdAt}
            header={
              <>
                {root && (
                  <div className="flex items-center gap-3 px-4 pb-2 text-xs font-medium text-muted-foreground">
                    <span>
                      {root.replyCount} {root.replyCount === 1 ? "reply" : "replies"}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <OlderMessages replies {...history} onOlder={() => loadOlder(rows[0]?.id)} />
              </>
            }
            footer={<JumpToLatest replies {...history} />}
          />
        )
      }
      composer={
        <>
          <AgentWorkNotice threadId={threadId} />
          <Composer
            organizationId={organizationId}
            conversationId={conversationId}
            threadId={threadId}
            label="Reply in thread…"
          />
        </>
      }
    />
  );
}
