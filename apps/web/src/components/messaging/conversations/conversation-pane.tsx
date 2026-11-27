import { canRemoveMember } from "@substrate/contracts/messaging/permissions";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";

import { Composer } from "../composer/composer";
import { MessageList } from "../messages/message-list";
import { useMessageHistory } from "../messages/use-message-history";
import { ThreadPane } from "../threads/thread-pane";
import { AddMembersDialog } from "./add-members-dialog";
import { ConversationActions } from "./conversation-actions";
import { AddPeopleButton, type HeaderMember } from "./conversation-header";
import {
  ConversationRecordSheet,
  ConversationSource,
  RecordSheetLink,
} from "./conversation-source";
import { EmptyConversation } from "./empty-conversation";
import { LeftChannelNotice } from "./left-channel-notice";
import { RemoveMemberAction, RemoveMemberDialog } from "./remove-member-action";
import type { MessageTarget } from "@/api/context/links";
import { AgentWorkNotice } from "@/components/agent-work/agent-work-slot";
import { ConversationAgentWork } from "@/components/agent-work/conversation-agent-work";
import { ConversationTurnTranscript } from "@/components/agent-work/transcript/conversation-turn-transcript";
import { ErrorState } from "@/components/feedback/error-state";
import { ConversationPane as ConversationPaneView } from "@/components/messaging/conversations/conversation-pane-view";
import { JumpToLatest, OlderMessages } from "@/components/messaging/messages/message-history";
import { MessageLoading } from "@/components/messaging/messages/message-loading";
import { ThreadPaneFrame } from "@/components/messaging/threads/thread-pane-frame";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { conversationTextLabel, type Conversation } from "@/lib/messaging/conversations";
import { messageLink, type MessageSource } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { messageTargetOptions } from "@/queries/context/links";
import { useConversationManagement } from "@/queries/messaging/management";
import { useConversationRead, useOpeningUnread } from "@/queries/messaging/read-state";

export function ConversationPane({
  conversation,
  messageId,
  turnId,
  header,
  onNavigate,
  source,
  sheet = false,
}: {
  conversation: Conversation;
  messageId?: string;
  turnId?: string;
  header?: ReactNode;
  onNavigate?: (target: { messageId?: string; turnId?: string }) => void;
  /** The CRM record the conversation was opened from. */
  source?: MessageSource;
  /** The record sheet is open: the task of a task discussion, or the source record. */
  sheet?: boolean;
}) {
  const { organizationId, userId } = useWorkspaceScope();
  const navigate = useNavigate();
  const navigateConversation = useConversationNavigation(
    organizationId,
    conversation.id,
    source,
    onNavigate,
  );
  const { join } = useConversationManagement(organizationId);
  const task = conversation.task;
  const target = useMessageTarget(organizationId, conversation.id, messageId);
  const [addingMembers, setAddingMembers] = useState(false);
  const [removingMember, setRemovingMember] = useState<HeaderMember | null>(null);
  const { messages, history, loadOlder, timeline, unread } = useConversationTimeline(
    {
      organizationId,
      conversationId: conversation.id,
      aroundMessageId: target.data?.root.id,
    },
    messageId && !turnId ? target.data?.root.id : undefined,
  );
  const resource = resourceState(messages);
  // The transcript keeps the open thread in the URL, so closing it returns to that thread.
  const transcript = (openTurnId?: string) =>
    navigateConversation({ messageId, turnId: openTurnId });
  return (
    <ConversationAgentWork conversation={conversation} onTranscript={transcript}>
      <ConversationPaneView
        header={header}
        conversation={resource.status === "unavailable" ? null : conversation}
        viewerId={userId}
        taskLink={task && <RecordSheetLink>{task.title}</RecordSheetLink>}
        source={source && <ConversationSource source={source} />}
        sheet={
          <ConversationRecordSheet
            conversation={conversation}
            source={source}
            open={sheet}
            onClose={() =>
              void navigate({
                to: "/messages",
                search: (previous) => ({ ...previous, sheet: undefined }),
              })
            }
          />
        }
        renderMemberAction={(member) =>
          canRemoveMember(conversation, userId, member) ? (
            <RemoveMemberAction member={member} onRemove={() => setRemovingMember(member)} />
          ) : null
        }
        state={resource.status}
        error={messages.error}
        onRetry={() => void messages.refetch()}
        addMembers={
          <>
            <AddPeopleButton
              expanded={addingMembers}
              onClick={() => setAddingMembers(!addingMembers)}
            />
            {addingMembers && (
              <AddMembersDialog
                organizationId={organizationId}
                conversationId={conversation.id}
                onClose={() => setAddingMembers(false)}
              />
            )}
          </>
        }
        messages={
          <ConversationMessages
            conversation={conversation}
            target={target}
            timeline={timeline}
            unread={unread}
            history={history}
            onOlder={() => loadOlder(timeline[0]?.id)}
            onThread={(id) => navigateConversation({ messageId: id })}
          />
        }
        actions={
          <ConversationActions
            conversation={conversation}
            onRemoved={() => navigate({ to: "/messages", search: { workspaceId: organizationId } })}
          />
        }
        leftNotice={
          <LeftChannelNotice
            pending={join.isPending}
            error={join.error}
            onJoin={() => join.mutate(conversation.id)}
          />
        }
        composer={<ConversationComposer conversation={conversation} />}
        thread={
          <ConversationAside
            conversation={conversation}
            messageId={messageId}
            turnId={turnId}
            target={target}
            timeline={timeline}
            onTranscriptClose={() => transcript()}
            onThreadClose={() => navigateConversation({})}
          />
        }
      />
      {removingMember && (
        <RemoveMemberDialog
          conversationId={conversation.id}
          member={removingMember}
          publicChannel={conversation.kind === "channel" && !conversation.private}
          onClose={() => setRemovingMember(null)}
        />
      )}
    </ConversationAgentWork>
  );
}

function useConversationNavigation(
  organizationId: string,
  conversationId: string,
  source?: MessageSource,
  onNavigate?: (target: { messageId?: string; turnId?: string }) => void,
) {
  const navigate = useNavigate();
  return (target: { messageId?: string; turnId?: string }) => {
    if (onNavigate) return onNavigate(target);
    // Threads and transcripts keep the record the conversation was opened from.
    const link = messageLink(organizationId, conversationId, undefined, source);
    void navigate({ ...link, search: { ...link.search, ...target } });
  };
}

function useMessageTarget(organizationId: string, conversationId: string, messageId?: string) {
  return useQuery(messageTargetOptions(organizationId, conversationId, messageId));
}

type ConversationTimeline = ReturnType<typeof useConversationTimeline>;

function ConversationMessages({
  conversation,
  target,
  timeline,
  unread,
  history,
  onOlder,
  onThread,
}: {
  conversation: Conversation;
  target: ReturnType<typeof useMessageTarget>;
  timeline: ConversationTimeline["timeline"];
  unread: ConversationTimeline["unread"];
  history: ConversationTimeline["history"];
  onOlder: () => void;
  onThread: (messageId: string) => void;
}) {
  if (target.error)
    return (
      <ErrorState
        variant="compact"
        title="Message unavailable"
        onRetry={() => void target.refetch()}
      />
    );
  if (timeline.length === 0) return <EmptyConversation conversation={conversation} />;
  return (
    <MessageList
      // A new conversation gets a fresh first scroll.
      key={conversation.id}
      {...unread}
      messages={timeline}
      conversationId={conversation.id}
      olderPage={history.hasPrevious}
      sending={history.sending}
      canPost={conversation.canPost}
      header={<OlderMessages {...history} onOlder={onOlder} />}
      footer={<JumpToLatest {...history} />}
      onThread={onThread}
    />
  );
}

/** The open turn transcript or thread beside the messages. */
function ConversationAside({
  conversation,
  messageId,
  turnId,
  target,
  timeline,
  onTranscriptClose,
  onThreadClose,
}: {
  conversation: Conversation;
  messageId?: string;
  turnId?: string;
  target: ReturnType<typeof useMessageTarget>;
  timeline: ConversationTimeline["timeline"];
  onTranscriptClose: () => void;
  onThreadClose: () => void;
}) {
  if (turnId)
    return (
      <ConversationTurnTranscript
        key={turnId}
        conversation={conversation}
        turnId={turnId}
        onClose={onTranscriptClose}
      />
    );
  if (!messageId || target.error) return null;
  // A root in the timeline opens its thread at once; the target read confirms it later.
  const root = timeline.find((message) => message.id === messageId && !message.threadId);
  return (
    <ConversationThreadAside
      conversation={conversation}
      target={target.data ?? (root && { root, message: root })}
      contextMessageIds={timeline.map((message) => message.id)}
      onClose={onThreadClose}
    />
  );
}

/** The open thread. Render it only for a message whose target loaded without error. */
function ConversationThreadAside({
  conversation,
  target,
  contextMessageIds,
  onClose,
}: {
  conversation: Conversation;
  target?: Pick<MessageTarget, "root" | "message">;
  contextMessageIds: string[];
  onClose: () => void;
}) {
  const activeThreadId = target?.root.id;
  return (
    <ThreadPaneFrame conversationLabel={conversationTextLabel(conversation)} onClose={onClose}>
      {activeThreadId ? (
        <ThreadPane
          key={activeThreadId}
          conversationId={conversation.id}
          threadId={activeThreadId}
          contextMessageIds={contextMessageIds}
          root={target.root}
          targetMessage={target.message}
          canPost={conversation.canPost}
        />
      ) : (
        <MessageLoading label="Loading replies" />
      )}
    </ThreadPaneFrame>
  );
}

function useConversationTimeline(
  options: Parameters<typeof useMessageHistory>[0],
  openThreadId?: string,
) {
  const { messages, history, loadOlder } = useMessageHistory(options);
  const timeline = messages.data ?? [];
  // Read before the read position can move, so the divider marks what was new on opening.
  const opening = useOpeningUnread(options.organizationId, options.conversationId, openThreadId);
  // The conversation whose newest message is in view; a pane reused for another one starts unseen.
  const [latestVisibleIn, setLatestVisibleIn] = useState<string>();
  // Only mark the conversation read when the current result reaches its newest message and the
  // person can see it.
  const canMarkRead =
    opening.ready &&
    latestVisibleIn === options.conversationId &&
    !messages.error &&
    !messages.isPlaceholderData &&
    !history.hasPrevious;
  useConversationRead(
    options.organizationId,
    options.conversationId,
    canMarkRead ? timeline.at(-1)?.id : undefined,
  );
  return {
    messages,
    history,
    loadOlder,
    timeline,
    unread: {
      firstUnreadMessageId: opening.messageId,
      unreadReplies: opening.unreadReplies,
      positionReady: opening.ready,
      onLatestVisibleChange: (visible: boolean) =>
        setLatestVisibleIn(visible ? options.conversationId : undefined),
    },
  };
}

function ConversationComposer({ conversation }: { conversation: Conversation }) {
  return (
    <>
      <AgentWorkNotice threadId={null} />
      {conversation.canPost ? (
        <Composer
          conversationId={conversation.id}
          label={`Message ${conversationTextLabel(conversation)}`}
        />
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Can view this discussion. Comment access is required to send messages.
        </p>
      )}
    </>
  );
}
