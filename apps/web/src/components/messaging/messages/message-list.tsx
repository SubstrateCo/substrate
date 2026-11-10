import { useQuery } from "@tanstack/react-query";

import { Fragment, type ReactNode } from "react";

import { MessageItem } from "./message-item";
import type { Message } from "@/api/messaging/requests";
import { DayDivider } from "@/components/messaging/messages/day-divider";
import { messageRows } from "@/components/messaging/messages/message-grouping";
import { MessageList as MessageListView } from "@/components/messaging/messages/message-list-view";
import { messagePageOptions } from "@/queries/context/links";

export function MessageList({
  messages,
  organizationId,
  conversationId,
  onThread,
  header,
  footer,
}: {
  messages: Message[];
  organizationId: string;
  conversationId: string;
  onThread?: (id: string) => void;
  /** The first row of the timeline, such as a way to load older messages. */
  header?: ReactNode;
  /** Floats over the bottom of the list, such as a jump to the latest messages. */
  footer?: ReactNode;
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
    <MessageListView lastId={messages.at(-1)?.id} header={header} footer={footer}>
      {messageRows(messages).map(({ message, newDay, grouped }) => (
        <Fragment key={message.id}>
          {newDay && <DayDivider date={message.createdAt} />}
          <MessageItem
            message={message}
            grouped={grouped}
            organizationId={organizationId}
            onThread={onThread}
            context={{
              data: contextById.get(message.id),
              loading: context.isPending,
              error: context.error,
              onRetry: () => void context.refetch(),
            }}
          />
        </Fragment>
      ))}
    </MessageListView>
  );
}
