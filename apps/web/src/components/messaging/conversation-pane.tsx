import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConversationPane as ConversationPaneView } from "@startup-os/ui/messaging/conversation-pane";
import { conversationName, type Conversation } from "@/lib/messaging";
import { messagesQueryOptions } from "@/queries/messaging/options";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { ThreadPane } from "./thread-pane";
import { AddMembersForm } from "./add-members-form";

export function ConversationPane({
  organizationId,
  conversation,
}: {
  organizationId: string;
  conversation: Conversation;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [addingMembers, setAddingMembers] = useState(false);
  const messages = useQuery(messagesQueryOptions(organizationId, conversation.id));
  return (
    <ConversationPaneView
      conversation={conversation}
      loading={messages.isPending}
      error={messages.error}
      hasLoaded={messages.data !== undefined}
      onRetry={() => void messages.refetch()}
      addingMembers={addingMembers}
      onToggleMembers={() => setAddingMembers(!addingMembers)}
      membersForm={
        <AddMembersForm
          organizationId={organizationId}
          conversationId={conversation.id}
          onClose={() => setAddingMembers(false)}
        />
      }
      messages={
        messages.data && messages.data.length > 0 ? (
          <MessageList
            messages={messages.data}
            organizationId={organizationId}
            onThread={setThreadId}
          />
        ) : undefined
      }
      composer={
        <Composer
          organizationId={organizationId}
          conversationId={conversation.id}
          label={`Message ${conversation.kind === "channel" ? "#" : ""}${conversationName(conversation)}`}
        />
      }
      thread={
        threadId && (
          <ThreadPane
            key={threadId}
            organizationId={organizationId}
            conversationId={conversation.id}
            threadId={threadId}
            root={messages.data?.find((message) => message.id === threadId)}
            onClose={() => setThreadId(null)}
          />
        )
      }
    />
  );
}
