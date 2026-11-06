import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConversationPane as ConversationPaneView } from "@startup-os/ui/messaging/conversation-pane";
import { conversationName, type Conversation } from "@/lib/messaging";
import { messagesQueryOptions } from "@/queries/messaging/options";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { ThreadPane } from "./thread-pane";
import { AddMembersForm } from "./add-members-form";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { messageTargetOptions } from "@/queries/context/options";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { Button } from "@startup-os/ui/primitives/button";

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
  const [beforeMessageId, setBeforeMessageId] = useState<string>();
  const [addingMembers, setAddingMembers] = useState(false);
  const messages = useQuery(
    messagesQueryOptions(organizationId, conversation.id, undefined, {
      beforeMessageId,
      aroundMessageId: target.data?.root.id,
    }),
  );
  const timeline = [...(messages.data ?? [])];
  if (target.data && !timeline.some((message) => message.id === target.data.root.id))
    timeline.push(target.data.root);
  let messageContent;
  if (target.error)
    messageContent = (
      <ErrorState compact title="Message unavailable" onRetry={() => void target.refetch()} />
    );
  else if (timeline.length > 0)
    messageContent = (
      <>
        <div className="flex gap-2 px-4">
          {messages.data?.length === 50 && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setBeforeMessageId(messages.data?.[0]?.id)}
            >
              Older messages
            </Button>
          )}
          {beforeMessageId && (
            <Button size="xs" variant="ghost" onClick={() => setBeforeMessageId(undefined)}>
              Back to latest
            </Button>
          )}
        </div>
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
      </>
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
