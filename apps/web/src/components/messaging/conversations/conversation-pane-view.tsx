import type { ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { PaneState } from "../../feedback/pane-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";
import { useDesktopThread } from "../threads/use-desktop-thread";
import { ConversationHeader } from "@/components/messaging/conversations/conversation-pane/conversation-header";
import { conversationName, type Conversation } from "@/lib/messaging/conversations";

export function ConversationPane({
  conversation,
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
}: {
  conversation: Conversation;
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
  const desktop = useDesktopThread();
  const showThread = !blocked && !initialLoading && !!thread;
  let channelIcon: "private" | "public" | undefined;
  if (!isAccessFailure(error) && conversation.kind === "channel") {
    if (conversation.private) {
      channelIcon = "private";
    } else {
      channelIcon = "public";
    }
  }
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 min-w-0 flex-1 max-lg:contents! max-lg:*:data-panel:contents!"
      >
        <ResizablePanel
          id="channel"
          minSize={300}
          className="flex min-h-0 min-w-0 flex-col max-lg:contents!"
        >
          <section
            inert={showThread && !desktop}
            aria-hidden={showThread && !desktop ? true : undefined}
            aria-label={title}
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
          >
            <ConversationHeader
              title={title}
              channelIcon={channelIcon}
              addingMembers={addingMembers}
              onToggleMembers={!blocked && conversation.kind !== "dm" ? onToggleMembers : undefined}
            />
            {!blocked && addingMembers && membersForm}
            {error && !blocked && (
              <div className="px-4 pt-3">
                <ErrorState
                  compact
                  title="Couldn’t refresh messages"
                  description="Your loaded messages are still available. Try again for the latest messages."
                  onRetry={onRetry}
                />
              </div>
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
            {!blocked && <div className="mt-auto shrink-0">{composer}</div>}
          </section>
        </ResizablePanel>
        {showThread && (
          <>
            <ResizableHandle aria-label="Resize thread" className="max-lg:hidden" />
            <ResizablePanel
              id="thread"
              defaultSize="40%"
              minSize={300}
              maxSize="65%"
              className="flex min-h-0 min-w-0 flex-col max-lg:contents!"
            >
              {thread}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
