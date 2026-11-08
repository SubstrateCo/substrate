import { useQuery } from "@tanstack/react-query";

import { MessageItem } from "./message-item";
import type { Message } from "@/api/messaging/requests";
import { MessageList as MessageListView } from "@/components/messaging/messages/message-list-view";
import { messagePageOptions } from "@/queries/context/links";

export function MessageList({
  messages,
  organizationId,
  conversationId,
  onThread,
}: {
  messages: Message[];
  organizationId: string;
  conversationId: string;
  onThread?: (id: string) => void;
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
    <MessageListView lastId={messages.at(-1)?.id}>
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          organizationId={organizationId}
          onThread={onThread}
          context={{
            data: contextById.get(message.id),
            loading: context.isPending,
            error: context.error,
            onRetry: () => void context.refetch(),
          }}
        />
      ))}
    </MessageListView>
  );
}
