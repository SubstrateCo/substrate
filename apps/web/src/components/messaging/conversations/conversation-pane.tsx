import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";

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
import { workLink } from "@/lib/navigation/record-links";
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
  header,
  onNavigate,
}: {
  organizationId: string;
  conversation: Conversation;
  userId: string;
  messageId?: string;
  turnId?: string;
  header?: ReactNode;
  onNavigate?: (target: { messageId?: string; turnId?: string }) => void;
}) {
  const navigate = useNavigate();
  const navigateConversation = (target: { messageId?: string; turnId?: string }) => {
    if (onNavigate) return onNavigate(target);
    void navigate({
      to: "/messages",
      search: { workspaceId: organizationId, conversationId: conversation.id, ...target },
    });
  };
  const { join } = useConversationManagement(organizationId);
  const task = conversation.task;
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
  const { messages, history, loadOlder, timeline } = useConversationTimeline({
    organizationId,
    conversationId: conversation.id,
    aroundMessageId: target.data?.root.id,
  });
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
        canPost={conversation.canPost}
        header={<OlderMessages {...history} onOlder={() => loadOlder(timeline[0]?.id)} />}
        footer={<JumpToLatest {...history} />}
        onThread={(id) => navigateConversation({ messageId: id })}
      />
    );
  // The transcript keeps the open thread in the URL, so closing it returns to that thread.
  const transcript = (openTurnId?: string) =>
    navigateConversation({ messageId, turnId: openTurnId });
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
  else if (activeThreadId)
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
        root={target.data?.root}
        targetMessage={target.data?.message}
        canPost={conversation.canPost}
        onClose={() => navigateConversation({})}
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
        header={header}
        conversation={resource.status === "unavailable" ? null : conversation}
        viewerId={userId}
        taskLink={
          task && (
            <Link
              {...workLink(organizationId, task.projectEntityId, task.taskEntityId)}
              className="underline decoration-muted-foreground underline-offset-4 hover:text-muted-foreground"
            >
              {task.title}
            </Link>
          )
        }
        memberAction={(member) =>
          canRemoveMember(conversation, userId, member) ? (
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
          !task && (
            <ConversationActions
              organizationId={organizationId}
              conversation={conversation}
              userId={userId}
              onRemoved={() =>
                navigate({ to: "/messages", search: { workspaceId: organizationId } })
              }
            />
          )
        }
        leftNotice={
          !task && (
            <LeftChannelNotice
              pending={join.isPending}
              error={join.error}
              onJoin={() => join.mutate(conversation.id)}
            />
          )
        }
        composer={
          <ConversationComposer organizationId={organizationId} conversation={conversation} />
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

function useConversationTimeline(options: Parameters<typeof useMessageHistory>[0]) {
  const { messages, history, loadOlder } = useMessageHistory(options);
  const timeline = messages.data ?? [];
  // Only mark the conversation read when the current result reaches its newest message.
  const canMarkRead = !messages.error && !messages.isPlaceholderData && !history.hasPrevious;
  useConversationRead(
    options.organizationId,
    options.conversationId,
    canMarkRead ? timeline.at(-1)?.id : undefined,
  );
  return { messages, history, loadOlder, timeline };
}

function canRemoveMember(conversation: Conversation, userId: string, member: HeaderMember) {
  return (
    !conversation.task &&
    conversation.canManage &&
    conversation.kind !== "dm" &&
    member.type === "human" &&
    member.organizationId === conversation.organizationId &&
    member.userId !== userId &&
    member.userId !== conversation.createdBy
  );
}

function ConversationComposer({
  organizationId,
  conversation,
}: {
  organizationId: string;
  conversation: Conversation;
}) {
  return (
    <>
      <AgentWorkNotice threadId={null} />
      {conversation.canPost ? (
        <Composer
          organizationId={organizationId}
          conversationId={conversation.id}
          label={`Message ${conversationLabel({ ...conversation, name: conversationName(conversation) })}`}
        />
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Can view this discussion. Comment access is required to send messages.
        </p>
      )}
    </>
  );
}
