import { MessageItem } from "./message-item";
import type { Message } from "@/lib/messaging";
import { MessageList as MessageListView } from "@/ui/messaging/message-list";

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
