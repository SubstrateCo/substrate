import { MessageItem } from "./message-item";
import type { Message } from "@/api/messaging/requests";
import { MessageList as MessageListView } from "@/components/messaging/messages/message-list-view";

export function MessageList({
  messages,
  organizationId,
  onThread,
}: {
  messages: Message[];
  organizationId: string;
  onThread?: (id: string) => void;
}) {
  return (
    <MessageListView lastId={messages.at(-1)?.id}>
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          organizationId={organizationId}
          onThread={onThread}
        />
      ))}
    </MessageListView>
  );
}
