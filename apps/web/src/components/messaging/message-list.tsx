import { MessageItem } from "./message-item";
import { MessageList as MessageListView } from "@/components/messaging/message-list-view";
import type { Message } from "@/lib/messaging";

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
