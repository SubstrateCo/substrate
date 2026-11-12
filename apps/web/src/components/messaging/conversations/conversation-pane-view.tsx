import type { ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { PaneState } from "../../feedback/pane-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { ConversationHeader } from "@/components/messaging/conversations/conversation-header";
import type { HeaderMember } from "@/components/messaging/conversations/conversation-header";
import {
  conversationLabel,
  conversationName,
  type Conversation,
} from "@/lib/messaging/conversations";
import type { ResourceStatus } from "@/lib/resource-state";

export function ConversationPane({
  conversation,
  viewerId,
  state,
  error,
  onRetry,
  addingMembers = false,
  onToggleMembers,
  membersForm,
  messages,
  composer,
  thread,
  actions,
  leftNotice,
  memberAction,
  taskLink,
}: {
  actions?: ReactNode;
  leftNotice?: ReactNode;
  memberAction?: (member: HeaderMember) => ReactNode;
  taskLink?: ReactNode;
  conversation: Conversation | null;
  /** The signed-in user, so a DM header shows the other person. */
  viewerId?: string;
  state: ResourceStatus;
  error?: Error | null;
  onRetry: () => void;
  addingMembers?: boolean;
  onToggleMembers: () => void;
  membersForm?: ReactNode;
  messages?: ReactNode;
  composer: ReactNode;
  thread?: ReactNode;
}) {
  const title = conversation ? conversationName(conversation) : "Conversation unavailable";
  const blocked = state === "error" || state === "unavailable";
  const initialLoading = state === "loading";
  const showThread = !blocked && !initialLoading && !!thread;
  let kind: "private" | "public" | "group" | "dm" | undefined;
  if (conversation?.kind === "channel") kind = conversation.private ? "private" : "public";
  if (conversation && conversation.kind !== "channel") kind = conversation.kind;
  const members = conversation?.members ?? [];
  let emptyTitle = `Your conversation with ${title}`;
  if (conversation?.kind === "channel")
    emptyTitle = `Welcome to ${conversationLabel({ kind: "channel", private: conversation.private, name: title })}`;
  if (taskLink) emptyTitle = "Task discussion";
  return (
    <PageLayout id="conversation" aria-label="Conversation">
      <PageContent>
        <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          <ConversationHeader
            title={title}
            taskLink={!blocked ? taskLink : undefined}
            kind={kind}
            viewerId={viewerId}
            members={taskLink ? [] : members}
            memberAction={!blocked ? memberAction : undefined}
            organizations={taskLink ? [] : (conversation?.organizations ?? [])}
            addingMembers={addingMembers}
            onToggleMembers={
              !blocked &&
              !taskLink &&
              conversation &&
              conversation.kind !== "dm" &&
              conversation.canManage
                ? onToggleMembers
                : undefined
            }
            actions={!blocked && actions}
          />
          {!blocked && !taskLink && addingMembers && membersForm}
          {state === "stale" && <StaleNotice>Messages may be out of date.</StaleNotice>}
          {blocked && (
            <PaneState
              label="Conversation unavailable"
              error={error}
              onRetry={state === "unavailable" ? undefined : onRetry}
            />
          )}
          {!blocked && initialLoading && <PaneState label="Loading messages…" />}
          {!blocked && !initialLoading && messages}
          {!blocked && !initialLoading && !messages && conversation && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-y-auto p-4 wrap-anywhere">
              <ContentNotice
                title={emptyTitle}
                description={
                  taskLink ? "No messages yet." : "No messages yet. Send the first message below."
                }
              />
            </div>
          )}
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
