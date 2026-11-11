import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { Composer } from "../composer/composer";
import { MessageList } from "../messages/message-list";
import { useMessageHistory } from "../messages/use-message-history";
import { ThreadPane } from "../threads/thread-pane";
import { AddMembersDialog } from "./add-members-dialog";
import { ConversationActions } from "./conversation-actions";
import type { HeaderMember } from "./conversation-header";
import { LeftChannelNotice } from "./left-channel-notice";
import { RemoveMemberAction, RemoveMemberDialog } from "./remove-member-action";
import { AgentWorkNotice } from "@/components/agent-work/agent-work-slot";
import { ConversationAgentWork } from "@/components/agent-work/conversation-agent-work";
import { ConversationTurnTranscript } from "@/components/agent-work/transcript/conversation-turn-transcript";
import { ErrorState } from "@/components/feedback/error-state";
import { ConversationPane as ConversationPaneView } from "@/components/messaging/conversations/conversation-pane-view";
import { JumpToLatest, OlderMessages } from "@/components/messaging/messages/message-history";
import {
  conversationLabel,
  conversationName,
  type Conversation,
} from "@/lib/messaging/conversations";
import { resourceState } from "@/lib/resource-state";
import { messageTargetOptions } from "@/queries/context/links";
import { useConversationManagement } from "@/queries/messaging/management";
import { useConversationRead } from "@/queries/messaging/read-state";

export function ConversationPane({
  organizationId,
  conversation,
  userId,
  messageId,
  turnId,
}: {
  organizationId: string;
  conversation: Conversation;
  userId: string;
  messageId?: string;
  turnId?: string;
}) {
  const navigate = useNavigate();
  const { join } = useConversationManagement(organizationId);
  const target = useQuery({
    ...messageTargetOptions(
      organizationId,
      conversation.id,
      messageId ?? "00000000-0000-0000-0000-000000000000",
    ),
    enabled: !!messageId,
  });
  const activeThreadId = messageId && !target.error ? target.data?.root.id : undefined;
  const [addingMembers, setAddingMembers] = useState(false);
  const [removingMember, setRemovingMember] = useState<HeaderMember | null>(null);
  const { messages, history, loadOlder } = useMessageHistory({
    organizationId,
    conversationId: conversation.id,
    aroundMessageId: target.data?.root.id,
  });
  const timeline = messages.data ?? [];
  useConversationRead(
    organizationId,
    conversation.id,
    !messages.error && !messages.isPlaceholderData && !history.hasPrevious
      ? timeline.at(-1)?.id
      : undefined,
  );
  const resource = resourceState(messages);
  let messageContent;
  if (target.error)
    messageContent = (
      <ErrorState compact title="Message unavailable" onRetry={() => void target.refetch()} />
    );
  else if (timeline.length > 0)
    messageContent = (
      <MessageList
        messages={timeline}
        organizationId={organizationId}
        conversationId={conversation.id}
        olderPage={history.hasPrevious}
        header={<OlderMessages {...history} onOlder={() => loadOlder(messages.data?.[0]?.id)} />}
        footer={<JumpToLatest {...history} />}
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
    );
  // The transcript keeps the open thread in the URL, so closing it returns to that thread.
  const transcript = (openTurnId?: string) =>
    void navigate({
      to: "/dashboard",
      search: {
        workspaceId: organizationId,
        conversationId: conversation.id,
        messageId,
        turnId: openTurnId,
      },
    });
  let aside;
  if (turnId)
    aside = (
      <ConversationTurnTranscript
        key={turnId}
        userId={userId}
        organizationId={organizationId}
        conversation={conversation}
        turnId={turnId}
        onClose={() => transcript()}
      />
    );
  else if (activeThreadId && !target.error)
    aside = (
      <ThreadPane
        key={activeThreadId}
        organizationId={organizationId}
        conversationId={conversation.id}
        conversationLabel={conversationLabel({
          ...conversation,
          name: conversationName(conversation),
        })}
        threadId={activeThreadId}
        contextMessageIds={timeline.map((message) => message.id)}
        root={target.data?.root ?? messages.data?.find((message) => message.id === activeThreadId)}
        targetMessage={target.data?.message}
        onClose={() => {
          void navigate({
            to: "/dashboard",
            search: { workspaceId: organizationId, conversationId: conversation.id },
          });
        }}
      />
    );
  return (
    <ConversationAgentWork
      userId={userId}
      organizationId={organizationId}
      conversation={conversation}
      onTranscript={transcript}
    >
      <ConversationPaneView
        conversation={resource.status === "unavailable" ? null : conversation}
        viewerId={userId}
        memberAction={(member) =>
          conversation.canManage &&
          conversation.kind !== "dm" &&
          member.type === "human" &&
          member.organizationId === conversation.organizationId &&
          member.userId !== userId &&
          member.userId !== conversation.createdBy ? (
            <RemoveMemberAction member={member} onRemove={() => setRemovingMember(member)} />
          ) : null
        }
        state={resource.status}
        error={messages.error}
        onRetry={() => void messages.refetch()}
        addingMembers={addingMembers}
        onToggleMembers={() => setAddingMembers(!addingMembers)}
        membersForm={
          <AddMembersDialog
            organizationId={organizationId}
            conversationId={conversation.id}
            onClose={() => setAddingMembers(false)}
          />
        }
        messages={messageContent}
        actions={
          <ConversationActions
            organizationId={organizationId}
            conversation={conversation}
            userId={userId}
            onRemoved={() =>
              navigate({ to: "/dashboard", search: { workspaceId: organizationId } })
            }
          />
        }
        leftNotice={
          <LeftChannelNotice
            pending={join.isPending}
            error={join.error}
            onJoin={() => join.mutate(conversation.id)}
          />
        }
        composer={
          <>
            <AgentWorkNotice threadId={null} />
            <Composer
              organizationId={organizationId}
              conversationId={conversation.id}
              label={`Message ${conversationLabel({ ...conversation, name: conversationName(conversation) })}`}
            />
          </>
        }
        thread={aside}
      />
      {removingMember && (
        <RemoveMemberDialog
          organizationId={organizationId}
          conversationId={conversation.id}
          member={removingMember}
          publicChannel={conversation.kind === "channel" && !conversation.private}
          onClose={() => setRemovingMember(null)}
        />
      )}
    </ConversationAgentWork>
  );
}
