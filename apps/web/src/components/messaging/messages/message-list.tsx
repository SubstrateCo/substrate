import { useQuery } from "@tanstack/react-query";

import { Fragment, type ReactNode } from "react";

import { MessageItem } from "./message-item";
import type { MessagePageContext } from "@/api/context/links";
import type { Message } from "@/api/messaging/requests";
import { DayDivider } from "@/components/messaging/messages/day-divider";
import { messageRows } from "@/components/messaging/messages/message-grouping";
import { MessageList as MessageListView } from "@/components/messaging/messages/message-list-view";
import { NewMessagesDivider } from "@/components/messaging/messages/new-messages-divider";
import { isSameDay } from "@/lib/format/date";
import { messagePageOptions } from "@/queries/context/links";

export function MessageList({
  messages,
  organizationId,
  conversationId,
  onThread,
  header,
  footer,
  previousDate,
  olderPage,
  canPost = true,
  firstUnreadMessageId,
  positionReady,
  onLatestVisibleChange,
}: {
  messages: Message[];
  organizationId: string;
  conversationId: string;
  onThread?: (id: string) => void;
  /** The first row of the timeline, such as a way to load older messages. */
  header?: ReactNode;
  /** Floats over the bottom of the list, such as a jump to the latest messages. */
  footer?: ReactNode;
  previousDate?: Message["createdAt"];
  olderPage?: boolean;
  canPost?: boolean;
  /** The "New" divider goes above this message. */
  firstUnreadMessageId?: string | null;
  positionReady?: boolean;
  onLatestVisibleChange?: (visible: boolean) => void;
}) {
  const context = useQuery(
    messagePageOptions(
      organizationId,
      conversationId,
      messages.map((message) => message.id),
    ),
  );
  const contextById = new Map(context.data?.map((row) => [row.messageId, row]));
  return (
    <MessageListView
      lastId={messages.at(-1)?.id}
      header={header}
      footer={footer}
      olderPage={olderPage}
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
            grouped={grouped}
            organizationId={organizationId}
            onThread={onThread}
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

// Takes the context as plain props, so a row whose props did not change keeps its rendered item.
function MessageRow({
  message,
  grouped,
  organizationId,
  onThread,
  data,
  loading,
  error,
  refetch,
  canPost,
}: {
  message: Message;
  grouped: boolean;
  organizationId: string;
  onThread?: (id: string) => void;
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
      organizationId={organizationId}
      onThread={onThread}
      canPost={canPost}
      context={{ data, loading, error, onRetry: () => refetch() }}
    />
  );
}
