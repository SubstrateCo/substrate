import type { LinkProps } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { ConversationSidebar } from "../conversations/conversation-sidebar";
import { focusConversationSidebar } from "../conversations/conversation-sidebar-focus";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { ConversationHeader } from "@/components/messaging/conversations/conversation-header";
import { MessageLoading } from "@/components/messaging/messages/message-loading";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/lib/messaging/conversations";
import type { ResourceStatus } from "@/lib/resource-state";
import { ArrowLeft, PanelLeft } from "lucide-react";

export function MessagingWorkspace({
  conversations,
  selectedId,
  sidebarOpen,
  onSidebarOpenChange,
  onSelect,
  conversationLink,
  renderSectionActions,
  renderCreate,
  loading = false,
  state,
  error,
  onRetry,
  renderContent,
}: {
  conversations: Conversation[];
  selectedId?: string;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  conversationLink: (id: string) => LinkProps;
  /**
   * The actions in a sidebar section header. `onCreate` opens the create dialog; call it with
   * focus on the button that opened it, so closing the dialog can return there.
   */
  renderSectionActions: (
    section: "channel" | "dm",
    onCreate: (kind: Conversation["kind"]) => void,
  ) => ReactNode;
  /**
   * The create dialog. It opens over the current conversation. Call `onRestoreFocus` when it
   * closes, so focus goes back to the button that opened it, or to the sidebar when that is gone.
   */
  renderCreate: (
    kind: Conversation["kind"],
    handlers: { onClose: () => void; onRestoreFocus: () => void },
  ) => ReactNode;
  loading?: boolean;
  state: ResourceStatus;
  error?: Error | null;
  onRetry: () => void;
  /**
   * The selected conversation, why it can't open, or the loading or empty pane. `onCreate` opens
   * the create dialog from the empty pane.
   */
  renderContent: (onCreate: (kind: Conversation["kind"]) => void) => ReactNode;
}) {
  // The empty state's buttons are gone once a conversation exists.
  const {
    value: creating,
    open: create,
    close,
    restoreFocus,
  } = useStateDialog<Conversation["kind"]>(focusConversationSidebar);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-2 py-1 md:hidden">
        <Button
          variant="ghost"
          size="sm"
          aria-controls="conversation-sidebar"
          aria-expanded={sidebarOpen}
          onClick={() => onSidebarOpenChange(!sidebarOpen)}
        >
          {sidebarOpen ? <ArrowLeft /> : <PanelLeft />}
          {sidebarOpen ? "Back to messages" : "Show conversations"}
        </Button>
      </div>
      <PageLayout
        id="messages"
        aria-label="Messages"
        mobileView={sidebarOpen ? "sidebar" : "content"}
      >
        <ConversationSidebar
          state={state}
          loading={loading}
          conversations={conversations}
          selectedId={selectedId}
          onSelect={onSelect}
          conversationLink={conversationLink}
          renderSectionActions={(section) => renderSectionActions(section, create)}
        />
        <PageContent>
          <WorkspaceContent
            state={state}
            error={error}
            onRetry={onRetry}
            onCreate={create}
            renderContent={renderContent}
          />
        </PageContent>
      </PageLayout>
      {creating && renderCreate(creating, { onClose: close, onRestoreFocus: restoreFocus })}
    </div>
  );
}

function WorkspaceContent({
  state,
  error,
  onRetry,
  onCreate,
  renderContent,
}: {
  state: ResourceStatus;
  error?: Error | null;
  onRetry: () => void;
  onCreate: (kind: Conversation["kind"]) => void;
  renderContent: (onCreate: (kind: Conversation["kind"]) => void) => ReactNode;
}) {
  if (state === "error" || state === "unavailable")
    return (
      <PaneState
        label={
          state === "unavailable" ? "Conversations unavailable" : "Couldn’t load conversations"
        }
        description={
          state === "unavailable"
            ? "Check that you still have access to this workspace."
            : undefined
        }
        error={error}
        onRetry={state === "unavailable" ? undefined : onRetry}
      />
    );
  return (
    <>
      {state === "stale" && (
        <StaleNotice className="px-4 py-2" title="Conversations may be out of date." />
      )}
      {renderContent(onCreate)}
    </>
  );
}

/** The conversation pane while the conversations load. */
export function WorkspaceLoading() {
  return (
    <section aria-label="Conversation" className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <ConversationHeader title={<SkeletonText width="10rem" />} />
      <MessageLoading label="Loading your conversations" />
    </section>
  );
}
