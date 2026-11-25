import { useQuery } from "@tanstack/react-query";

import { Composer } from "../composer/composer";
import { MessageItem } from "../messages/message-item";
import { MessageList } from "../messages/message-list";
import { useMessageHistory } from "../messages/use-message-history";
import type { Message } from "@/api/messaging/requests";
import { AgentWorkNotice } from "@/components/agent-work/agent-work-slot";
import { ContentNotice } from "@/components/feedback/content-notice";
import { JumpToLatest, OlderMessages } from "@/components/messaging/messages/message-history";
import { ThreadPane as ThreadPaneView } from "@/components/messaging/threads/thread-pane-view";
import { resourceState } from "@/lib/resource-state";
import { messagePageOptions } from "@/queries/context/links";
import { useConversationRead } from "@/queries/messaging/read-state";
import { MessagesSquare } from "lucide-react";

export function ThreadPane({
  organizationId,
  conversationId,
  threadId,
  root,
  contextMessageIds,
  targetMessage,
  canPost = true,
}: {
  organizationId: string;
  conversationId: string;
  threadId: string;
  root?: Message;
  contextMessageIds: string[];
  targetMessage?: Message;
  canPost?: boolean;
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
  useConversationRead(
    organizationId,
    conversationId,
    !replies.error && !replies.isPlaceholderData && !history.hasPrevious
      ? rows.at(-1)?.id
      : undefined,
  );
  const resource = resourceState(replies);
  const replyRows = rows.filter((message) => message.id !== threadId);
  const empty = !!resource.data && !replyRows.length && !history.hasPrevious;
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
      state={resource.status}
      loading={replies.isPending}
      error={replies.error}
      onRetry={() => void replies.refetch()}
      root={
        root && (
          <MessageItem
            threadRoot
            message={root}
            organizationId={organizationId}
            canPost={canPost}
            context={{
              data: rootContext.data?.find((row) => row.messageId === root.id),
              loading: rootContext.isPending,
              error: rootContext.error,
              onRetry: () => void rootContext.refetch(),
            }}
          />
        )
      }
      replies={
        empty ? (
          <ContentNotice
            icon={MessagesSquare}
            title="No replies yet"
            description={canPost ? "Reply below to start the thread." : undefined}
          />
        ) : (
          resource.data && (
            <MessageList
              messages={replyRows}
              organizationId={organizationId}
              conversationId={conversationId}
              olderPage={history.hasPrevious}
              canPost={canPost}
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
        )
      }
      composer={
        <>
          <AgentWorkNotice threadId={threadId} />
          {canPost && (
            <Composer
              organizationId={organizationId}
              conversationId={conversationId}
              threadId={threadId}
              label="Reply in thread"
            />
          )}
        </>
      }
    />
  );
}
