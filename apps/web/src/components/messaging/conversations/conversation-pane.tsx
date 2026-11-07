import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { Composer } from "../composer/composer";
import { MessageList } from "../messages/message-list";
import { useMessageHistory } from "../messages/use-message-history";
import { ThreadPane } from "../threads/thread-pane";
import { AddMembersForm } from "./add-members-form";
import { ConversationPane as ConversationPaneView } from "@/components/messaging/conversations/conversation-pane-view";
import { MessageHistory } from "@/components/messaging/messages/message-history";
import { MessageUnavailable } from "@/components/messaging/messages/message-unavailable";
import { conversationName, type Conversation } from "@/lib/messaging/conversations";
import { messageTargetOptions } from "@/queries/context/links";

export function ConversationPane({
  organizationId,
  conversation,
}: {
  organizationId: string;
  conversation: Conversation;
}) {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const target = useQuery({
    ...messageTargetOptions(
      organizationId,
      conversation.id,
      search.messageId ?? "00000000-0000-0000-0000-000000000000",
    ),
    enabled: !!search.messageId,
  });
  const activeThreadId = search.messageId && !target.error ? target.data?.root.id : undefined;
  const [addingMembers, setAddingMembers] = useState(false);
  const { messages, history, loadOlder } = useMessageHistory({
    organizationId,
    conversationId: conversation.id,
    aroundMessageId: target.data?.root.id,
  });
  const timeline = [...(messages.data ?? [])];
  if (target.data && !timeline.some((message) => message.id === target.data.root.id))
    timeline.push(target.data.root);
  let messageContent;
  if (target.error) messageContent = <MessageUnavailable onRetry={() => void target.refetch()} />;
  else if (timeline.length > 0)
    messageContent = (
      <MessageHistory {...history} onOlder={() => loadOlder(messages.data?.[0]?.id)}>
        <MessageList
          messages={timeline}
          organizationId={organizationId}
          onThread={(id) => {
            void navigate({
              to: "/dashboard",
              search: {
                workspaceId: organizationId,
                conversationId: conversation.id,
                messageId: id,
              },
            });
          }}
        />
      </MessageHistory>
    );
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
      messages={messageContent}
      composer={
        <Composer
          organizationId={organizationId}
          conversationId={conversation.id}
          label={`Message ${conversation.kind === "channel" ? "#" : ""}${conversationName(conversation)}`}
        />
      }
      thread={
        activeThreadId &&
        !target.error && (
          <ThreadPane
            key={activeThreadId}
            organizationId={organizationId}
            conversationId={conversation.id}
            threadId={activeThreadId}
            root={
              target.data?.root ?? messages.data?.find((message) => message.id === activeThreadId)
            }
            targetMessage={target.data?.message}
            onClose={() => {
              void navigate({
                to: "/dashboard",
                search: { workspaceId: organizationId, conversationId: conversation.id },
              });
            }}
          />
        )
      }
    />
  );
}
