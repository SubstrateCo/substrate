import type { LinkProps } from "@tanstack/react-router";

import { Children, type ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { ConversationSidebar } from "../conversations/conversation-sidebar";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import type { DirectMessageAgent } from "@/components/messaging/conversations/conversation-create-menu";
import { ConversationHeader } from "@/components/messaging/conversations/conversation-header";
import { MessageLoading } from "@/components/messaging/messages/message-loading";
import { WorkspaceEmpty } from "@/components/messaging/workspace/workspace-empty";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/lib/messaging/conversations";
import type { PickerPerson } from "@/lib/people/people-picker";
import type { ResourceStatus } from "@/lib/resource-state";
import { ArrowLeft, PanelLeft } from "lucide-react";

/** The empty state's buttons are gone once a conversation exists. */
function focusSidebar() {
  document
    .querySelector<HTMLElement>(
      '#conversation-sidebar [aria-current="page"], #conversation-sidebar button',
    )
    ?.focus();
}

export function MessagingWorkspace({
  conversations,
  selectedId,
  sidebarOpen,
  onSidebarOpenChange,
  onSelect,
  conversationLink,
  people,
  agents,
  onMessagePerson,
  onMessageAgent,
  renderCreate,
  loading = false,
  state,
  error,
  onRetry,
  children,
}: {
  conversations: Conversation[];
  selectedId?: string;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  conversationLink: (id: string) => LinkProps;
  people?: PickerPerson[];
  agents?: DirectMessageAgent[];
  onMessagePerson?: (person: PickerPerson) => void;
  onMessageAgent?: (agent: DirectMessageAgent) => void;
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
  children?: ReactNode;
}) {
  const {
    value: creating,
    open: create,
    close,
    restoreFocus,
  } = useStateDialog<Conversation["kind"]>(focusSidebar);
  const blocked = state === "error" || state === "unavailable";
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
          error={blocked ? error : undefined}
          onRetry={onRetry}
          conversations={conversations}
          selectedId={selectedId}
          people={people}
          agents={agents}
          onMessagePerson={onMessagePerson}
          onMessageAgent={onMessageAgent}
          onSelect={onSelect}
          conversationLink={conversationLink}
          onCreate={create}
        />
        <PageContent>
          <WorkspaceContent
            state={state}
            error={error}
            onRetry={onRetry}
            loading={loading}
            onCreate={create}
          >
            {children}
          </WorkspaceContent>
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
  loading,
  onCreate,
  children,
}: {
  state: ResourceStatus;
  error?: Error | null;
  onRetry: () => void;
  loading: boolean;
  onCreate: (kind: Conversation["kind"]) => void;
  children?: ReactNode;
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
  const hasContent = Children.toArray(children).length > 0;
  return (
    <>
      {state === "stale" && <StaleNotice>Conversations may be out of date.</StaleNotice>}
      {hasContent && children}
      {!hasContent &&
        (loading ? (
          <section
            aria-label="Conversation"
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
          >
            <ConversationHeader title={<SkeletonText width="10rem" />} addingMembers={false} />
            <MessageLoading label="Loading your conversations" />
          </section>
        ) : (
          <WorkspaceEmpty onCreate={onCreate} />
        ))}
    </>
  );
}
