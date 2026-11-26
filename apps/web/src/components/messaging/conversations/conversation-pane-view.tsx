import type { ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { PaneState } from "../../feedback/pane-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { ConversationHeader } from "@/components/messaging/conversations/conversation-header";
import type { HeaderMember } from "@/components/messaging/conversations/conversation-header";
import { MessageLoading } from "@/components/messaging/messages/message-loading";
import {
  conversationLabel,
  conversationName,
  type Conversation,
} from "@/lib/messaging/conversations";
import type { ResourceStatus } from "@/lib/resource-state";

type ConversationPaneProps = {
  header?: ReactNode;
  actions?: ReactNode;
  leftNotice?: ReactNode;
  renderMemberAction?: (member: HeaderMember) => ReactNode;
  taskLink?: ReactNode;
  conversation: Conversation | null;
  /** The signed-in user, so a DM header shows the other person. */
  viewerId?: string;
  state: ResourceStatus;
  error?: Error | null;
  onRetry: () => void;
  /** The Add people control and its dialog. Shown only where the viewer can add people. */
  addMembers?: ReactNode;
  messages?: ReactNode;
  composer: ReactNode;
  thread?: ReactNode;
};

export function ConversationPane({
  conversation,
  viewerId,
  state,
  error,
  onRetry,
  addMembers,
  messages,
  composer,
  thread,
  actions,
  leftNotice,
  renderMemberAction,
  taskLink,
  header,
}: ConversationPaneProps) {
  const title = conversation ? conversationName(conversation) : "Conversation unavailable";
  const blocked = state === "error" || state === "unavailable";
  const showThread = !blocked && !!thread;
  return (
    <PageLayout id="conversation" aria-label="Conversation">
      <PageContent>
        <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          {header === undefined ? (
            <PaneHeader
              title={title}
              blocked={blocked}
              taskLink={taskLink}
              conversation={conversation}
              viewerId={viewerId}
              renderMemberAction={renderMemberAction}
              addMembers={addMembers}
              actions={actions}
            />
          ) : (
            header
          )}
          <PaneMessages
            title={title}
            conversation={conversation}
            taskLink={taskLink}
            state={state}
            error={error}
            onRetry={onRetry}
            messages={messages}
          />
          {!blocked && (
            <div className="mt-auto shrink-0">
              {conversation && !conversation.joined && leftNotice}
              {composer}
            </div>
          )}
        </section>
      </PageContent>
      {showThread && thread}
    </PageLayout>
  );
}

function PaneHeader({
  title,
  blocked,
  taskLink,
  conversation,
  viewerId,
  renderMemberAction,
  addMembers,
  actions,
}: Pick<
  ConversationPaneProps,
  "taskLink" | "conversation" | "viewerId" | "renderMemberAction" | "addMembers" | "actions"
> & {
  title: string;
  blocked: boolean;
}) {
  const canAddMembers =
    !blocked &&
    !taskLink &&
    conversation?.kind !== "dm" &&
    (conversation?.canManage || conversation?.joined);
  return (
    <ConversationHeader
      title={title}
      taskLink={!blocked ? taskLink : undefined}
      visibility={conversation ?? undefined}
      viewerId={viewerId}
      members={taskLink ? [] : (conversation?.members ?? [])}
      renderMemberAction={!blocked ? renderMemberAction : undefined}
      organizations={taskLink ? [] : (conversation?.organizations ?? [])}
      addMembers={canAddMembers && addMembers}
      actions={!blocked && actions}
    />
  );
}

function PaneMessages({
  title,
  conversation,
  taskLink,
  state,
  error,
  onRetry,
  messages,
}: Pick<
  ConversationPaneProps,
  "conversation" | "taskLink" | "state" | "error" | "onRetry" | "messages"
> & {
  title: string;
}) {
  if (state === "error" || state === "unavailable")
    return (
      <PaneState
        label={state === "unavailable" ? "Conversation unavailable" : "Couldn’t load messages"}
        description={
          state === "unavailable"
            ? "This conversation was removed or you no longer have access."
            : undefined
        }
        error={error}
        onRetry={state === "unavailable" ? undefined : onRetry}
      />
    );
  if (state === "loading") return <MessageLoading label="Loading messages" />;
  return (
    <>
      {state === "stale" && <StaleNotice>Messages may be out of date.</StaleNotice>}
      {messages}
      {!messages && conversation && (
        <EmptyConversation title={title} conversation={conversation} taskDiscussion={!!taskLink} />
      )}
    </>
  );
}

function EmptyConversation({
  title,
  conversation,
  taskDiscussion,
}: {
  title: string;
  conversation: Conversation;
  taskDiscussion: boolean;
}) {
  let emptyTitle = `Your conversation with ${title}`;
  if (taskDiscussion) emptyTitle = "Task discussion";
  else if (conversation.kind === "channel")
    emptyTitle = `Welcome to ${conversationLabel({ kind: "channel", private: conversation.private, name: title })}`;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 wrap-anywhere">
      <ContentNotice
        title={emptyTitle}
        description={
          taskDiscussion ? "No messages yet." : "No messages yet. Send the first message below."
        }
      />
    </div>
  );
}
