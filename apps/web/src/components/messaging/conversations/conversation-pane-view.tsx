import type { ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { PaneState } from "../../feedback/pane-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { ConversationHeader } from "@/components/messaging/conversations/conversation-header";
import { conversationName, type Conversation } from "@/lib/messaging/conversations";

export function ConversationPane({
  conversation,
  viewerId,
  loading = false,
  error,
  onRetry,
  addingMembers = false,
  onToggleMembers,
  membersForm,
  messages,
  hasLoaded = !!messages,
  composer,
  thread,
  actions,
  leftNotice,
}: {
  actions?: ReactNode;
  leftNotice?: ReactNode;
  conversation: Conversation;
  /** The signed-in user, so a DM header shows the other person. */
  viewerId?: string;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  addingMembers?: boolean;
  onToggleMembers: () => void;
  membersForm?: ReactNode;
  messages?: ReactNode;
  hasLoaded?: boolean;
  composer: ReactNode;
  thread?: ReactNode;
}) {
  const title = isAccessFailure(error)
    ? "Conversation unavailable"
    : conversationName(conversation);
  const blocked = !!error && (!hasLoaded || isAccessFailure(error));
  const initialLoading = loading && !hasLoaded;
  const showThread = !blocked && !initialLoading && !!thread;
  const hidden = isAccessFailure(error);
  let kind: "private" | "public" | "group" | "dm" | undefined;
  if (!hidden && conversation.kind === "channel")
    kind = conversation.private ? "private" : "public";
  if (!hidden && conversation.kind !== "channel") kind = conversation.kind;
  const members = hidden
    ? []
    : conversation.members.filter(
        (member) => conversation.kind !== "dm" || !viewerId || member.userId !== viewerId,
      );
  return (
    <PageLayout id="conversation" aria-label="Conversation">
      <PageContent>
        <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          <ConversationHeader
            title={title}
            kind={kind}
            members={members}
            partner={!hidden && conversation.partner}
            addingMembers={addingMembers}
            onToggleMembers={
              !blocked && conversation.kind !== "dm" && conversation.canManage
                ? onToggleMembers
                : undefined
            }
            actions={!blocked && actions}
          />
          {!blocked && addingMembers && membersForm}
          {error && !blocked && (
            <p role="status" className="px-4 pt-3 text-xs text-muted-foreground">
              Messages may be out of date.
            </p>
          )}
          {blocked && (
            <PaneState label="Conversation unavailable" error={error} onRetry={onRetry} />
          )}
          {!blocked && initialLoading && <PaneState label="Loading messages…" />}
          {!blocked && !initialLoading && messages}
          {!blocked && !initialLoading && !messages && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-y-auto p-4 wrap-anywhere">
              <ContentNotice
                title={
                  conversation.kind === "channel"
                    ? `Welcome to #${title}`
                    : `Your conversation with ${title}`
                }
                description="No messages yet. Send the first message below."
              />
            </div>
          )}
          {!blocked && (
            <div className="mt-auto shrink-0">
              {!conversation.joined && leftNotice}
              {composer}
            </div>
          )}
        </section>
      </PageContent>
      {showThread && thread}
    </PageLayout>
  );
}
