import { canManageOwnAgents } from "@substrate/contracts/messaging/permissions";

import type { ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import {
  ConversationHeader,
  TaskDiscussionHeader,
} from "@/components/messaging/conversations/conversation-header";
import type { HeaderMember } from "@/components/messaging/conversations/conversation-header";
import { MessageLoading } from "@/components/messaging/messages/message-loading";
import { conversationName, type Conversation } from "@/lib/messaging/conversations";
import type { ResourceStatus } from "@/lib/resource-state";

type ConversationPaneProps = {
  /** Replaces the pane's own header; `null` shows none. */
  header?: ReactNode;
  actions?: ReactNode;
  leftNotice?: ReactNode;
  renderMemberAction?: (member: HeaderMember) => ReactNode;
  /** Set for a task discussion: the link that opens its task heads the pane. */
  taskLink?: ReactNode;
  /** Under the header: the record the conversation was opened from. */
  source?: ReactNode;
  /** The record sheet over the pane: a task discussion's task, or the record it was opened from. */
  sheet?: ReactNode;
  conversation: Conversation | null;
  /** The signed-in user, so a DM header shows the other person. */
  viewerId?: string;
  state: ResourceStatus;
  error?: Error | null;
  onRetry: () => void;
  /** The Add people control and its dialog. Shown only where the viewer can add people. */
  addMembers?: ReactNode;
  /** The messages, or the empty conversation. */
  messages: ReactNode;
  composer: ReactNode;
  thread?: ReactNode;
};

export function ConversationPane(props: ConversationPaneProps) {
  const { conversation, state, taskLink } = props;
  if (state === "error" || state === "unavailable" || !conversation)
    return <BlockedConversationPane {...props} />;
  if (taskLink) return <TaskDiscussionPane {...props} conversation={conversation} />;
  return <OpenConversationPane {...props} conversation={conversation} />;
}

/** The messages failed to load or access is gone: no composer and no thread. */
function BlockedConversationPane({
  conversation,
  viewerId,
  state,
  error,
  onRetry,
  header,
}: ConversationPaneProps) {
  const title = conversation ? conversationName(conversation) : "Conversation unavailable";
  const unavailable = state === "unavailable";
  return (
    <ConversationPaneLayout
      title={title}
      header={header}
      defaultHeader={
        <ConversationHeader
          title={title}
          visibility={conversation ?? undefined}
          viewerId={viewerId}
        />
      }
    >
      <PaneState
        label={unavailable ? "Conversation unavailable" : "Couldn’t load messages"}
        description={
          unavailable ? "This conversation was removed or you no longer have access." : undefined
        }
        error={error}
        onRetry={unavailable ? undefined : onRetry}
      />
    </ConversationPaneLayout>
  );
}

/** A task's discussion: its header links back to the task, without members or actions. */
function TaskDiscussionPane({
  conversation,
  taskLink,
  header,
  ...props
}: ConversationPaneProps & { conversation: Conversation }) {
  return (
    <ConversationPaneLayout
      title={conversationName(conversation)}
      header={header}
      defaultHeader={<TaskDiscussionHeader taskLink={taskLink} />}
      composer={props.composer}
      thread={props.thread}
      sheet={props.sheet}
    >
      <PaneMessages {...props} />
    </ConversationPaneLayout>
  );
}

function OpenConversationPane({
  conversation,
  viewerId,
  header,
  renderMemberAction,
  addMembers,
  actions,
  leftNotice,
  source,
  ...props
}: ConversationPaneProps & { conversation: Conversation }) {
  const title = conversationName(conversation);
  // Managers add people; members add their own agents.
  const canAddMembers = conversation.canManage || canManageOwnAgents(conversation);
  return (
    <ConversationPaneLayout
      title={title}
      header={header}
      defaultHeader={
        <>
          <ConversationHeader
            title={title}
            visibility={conversation}
            viewerId={viewerId}
            members={conversation.members}
            renderMemberAction={renderMemberAction}
            organizations={conversation.organizations}
            addMembers={canAddMembers && addMembers}
            actions={actions}
          />
          {source}
        </>
      }
      composer={
        <>
          {!conversation.joined && leftNotice}
          {props.composer}
        </>
      }
      thread={props.thread}
      sheet={props.sheet}
    >
      <PaneMessages {...props} />
    </ConversationPaneLayout>
  );
}

function ConversationPaneLayout({
  title,
  header,
  defaultHeader,
  composer,
  thread,
  sheet,
  children,
}: {
  title: string;
  header: ReactNode | undefined;
  defaultHeader: ReactNode;
  composer?: ReactNode;
  thread?: ReactNode;
  sheet?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageLayout id="conversation" aria-label="Conversation">
      <PageContent>
        <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          {header === undefined ? defaultHeader : header}
          {children}
          {composer && <div className="mt-auto shrink-0">{composer}</div>}
        </section>
      </PageContent>
      {thread}
      {sheet}
    </PageLayout>
  );
}

function PaneMessages({ state, messages }: Pick<ConversationPaneProps, "state" | "messages">) {
  if (state === "loading") return <MessageLoading label="Loading messages" />;
  return (
    <>
      {state === "stale" && (
        <StaleNotice className="px-4 py-2" title="Messages may be out of date." />
      )}
      {messages}
    </>
  );
}
