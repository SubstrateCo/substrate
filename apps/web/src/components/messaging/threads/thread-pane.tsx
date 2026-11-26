import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { Composer } from "../composer/composer";
import { MessageItem } from "../messages/message-item";
import { MessageList } from "../messages/message-list";
import { useMessageHistory } from "../messages/use-message-history";
import type { Message } from "@/api/messaging/requests";
import { AgentWorkNotice } from "@/components/agent-work/agent-work-slot";
import type { MessageContextState } from "@/components/context/references/message-context";
import { ContentNotice } from "@/components/feedback/content-notice";
import { JumpToLatest, OlderMessages } from "@/components/messaging/messages/message-history";
import { ThreadPane as ThreadPaneView } from "@/components/messaging/threads/thread-pane-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { resourceState } from "@/lib/resource-state";
import { messagePageOptions } from "@/queries/context/links";
import { useConversationRead } from "@/queries/messaging/read-state";
import { MessagesSquare } from "lucide-react";

export function ThreadPane({
  conversationId,
  threadId,
  root,
  contextMessageIds,
  targetMessage,
  canPost = true,
}: {
  conversationId: string;
  threadId: string;
  root?: Message;
  contextMessageIds: string[];
  targetMessage?: Message;
  canPost?: boolean;
}) {
  const { organizationId } = useWorkspaceScope();
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
  const resource = resourceState(replies);
  const replyRows = rows.filter((message) => message.id !== threadId);
  const empty = !!resource.data && !replyRows.length && !history.hasPrevious;
  // As in the conversation pane, a reply counts as read only once the newest one is in view. A
  // thread with no replies has nothing below the root to miss.
  const [latestVisible, setLatestVisible] = useState(false);
  useConversationRead(
    organizationId,
    conversationId,
    !replies.error && !replies.isPlaceholderData && !history.hasPrevious && (empty || latestVisible)
      ? rows.at(-1)?.id
      : undefined,
    threadId,
  );
  const rootContext = useRootContext(organizationId, conversationId, contextMessageIds, root);
  return (
    <ThreadPaneView
      state={resource.status}
      loading={replies.isPending}
      error={replies.error}
      onRetry={() => void replies.refetch()}
      root={
        root && <MessageItem threadRoot message={root} canPost={canPost} context={rootContext} />
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
              conversationId={conversationId}
              olderPage={history.hasPrevious}
              sending={history.sending}
              canPost={canPost}
              previousDate={root?.createdAt}
              onLatestVisibleChange={setLatestVisible}
              header={
                <>
                  {root && <ReplyCount count={root.replyCount} />}
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
            <Composer conversationId={conversationId} threadId={threadId} label="Reply in thread" />
          )}
        </>
      }
    />
  );
}

/** The context of the thread root. Reuse the conversation's page when it holds the root. */
function useRootContext(
  organizationId: string,
  conversationId: string,
  contextMessageIds: string[],
  root?: Message,
): MessageContextState {
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
  return {
    data: rootContext.data?.find((row) => row.messageId === root?.id),
    loading: rootContext.isPending,
    error: rootContext.error,
    onRetry: () => void rootContext.refetch(),
  };
}

function ReplyCount({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-2 text-xs font-medium text-muted-foreground">
      <span>
        {count} {count === 1 ? "reply" : "replies"}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
