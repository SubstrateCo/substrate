import { ContentNotice } from "@/components/feedback/content-notice";
import {
  conversationLabel,
  conversationName,
  type Conversation,
} from "@/lib/messaging/conversations";

export function EmptyConversation({ conversation }: { conversation: Conversation }) {
  const title = conversationName(conversation);
  let emptyTitle = `Your conversation with ${title}`;
  if (conversation.task) emptyTitle = "Task discussion";
  else if (conversation.kind === "channel")
    emptyTitle = `Welcome to ${conversationLabel({ kind: "channel", private: conversation.private, name: title })}`;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 wrap-anywhere">
      <ContentNotice
        title={emptyTitle}
        description={
          conversation.task ? "No messages yet." : "No messages yet. Send the first message below."
        }
      />
    </div>
  );
}
