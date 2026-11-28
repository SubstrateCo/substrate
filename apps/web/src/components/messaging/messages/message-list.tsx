import { useQuery } from "@tanstack/react-query";

import { Fragment, type ReactNode } from "react";

import { MessageItem } from "./message-item";
import type { MessagePageContext } from "@/api/context/links";
import type { Message } from "@/api/messaging/requests";
import { usePendingAgentReply } from "@/components/agent-work/agent-work-context";
import { DayDivider } from "@/components/messaging/messages/day-divider";
import { messageRows } from "@/components/messaging/messages/message-grouping";
import { MessageList as MessageListView } from "@/components/messaging/messages/message-list-view";
import { NewMessagesDivider } from "@/components/messaging/messages/new-messages-divider";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { isSameDay } from "@/lib/format/date";
import { messagePageOptions } from "@/queries/context/links";

export function MessageList({
  messages,
  conversationId,
  onThread,
  header,
  footer,
  previousDate,
  olderPage,
  sending,
  canPost = true,
  firstUnreadMessageId,
  unreadReplies,
  positionReady,
  onLatestVisibleChange,
}: {
  messages: Message[];
  conversationId: string;
  onThread?: (id: string) => void;
  header?: ReactNode;
  footer?: ReactNode;
  previousDate?: Message["createdAt"];
  olderPage?: boolean;
  sending?: boolean;
  canPost?: boolean;
  firstUnreadMessageId?: string | null;
  unreadReplies?: ReadonlyMap<string, number>;
  positionReady?: boolean;
  onLatestVisibleChange?: (visible: boolean) => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const context = useQuery(
    messagePageOptions(
      organizationId,
      conversationId,
      messages.map((message) => message.id),
    ),
  );
  const contextById = new Map(context.data?.map((row) => [row.messageId, row]));
  const pendingAgentReply = usePendingAgentReply();
  return (
    <MessageListView
      lastId={messages.at(-1)?.id}
      header={header}
      footer={footer}
      olderPage={olderPage}
      sending={sending}
      positionReady={positionReady}
      onLatestVisibleChange={onLatestVisibleChange}
    >
      {messageRows(messages).map(({ message, newDay, grouped }, index) => (
        <Fragment key={message.id}>
          {newDay &&
            !(index === 0 && previousDate && isSameDay(previousDate, message.createdAt)) && (
              <DayDivider date={message.createdAt} />
            )}
          {message.id === firstUnreadMessageId && <NewMessagesDivider />}
          <MessageRow
            message={message}
            grouped={grouped && !pendingAgentReply(messages[index - 1]?.id ?? "")}
            onThread={onThread}
            unreadReplies={unreadReplies?.get(message.id)}
            canPost={canPost}
            data={contextById.get(message.id)}
            loading={context.isPending}
            error={context.error}
            refetch={context.refetch}
          />
        </Fragment>
      ))}
    </MessageListView>
  );
}

function MessageRow({
  message,
  grouped,
  onThread,
  unreadReplies,
  data,
  loading,
  error,
  refetch,
  canPost,
}: {
  message: Message;
  grouped: boolean;
  onThread?: (id: string) => void;
  unreadReplies?: number;
  data?: MessagePageContext;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  canPost: boolean;
}) {
  return (
    <MessageItem
      message={message}
      grouped={grouped}
      onThread={onThread}
      unreadReplies={unreadReplies}
      canPost={canPost}
      context={{ data, loading, error, onRetry: () => refetch() }}
    />
  );
}
