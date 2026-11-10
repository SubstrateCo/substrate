import { Children, useState, type ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { ComposerDraftProvider } from "../composer/composer-drafts";
import { ConversationSidebar } from "../conversations/conversation-sidebar";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import type { DirectMessageAgent } from "@/components/messaging/conversations/conversation-create-menu";
import { WorkspaceEmpty } from "@/components/messaging/workspace/workspace-empty";
import type { Conversation } from "@/lib/messaging/conversations";
import type { PickerPerson } from "@/lib/people/people-picker";
import { ArrowLeft, PanelLeft } from "lucide-react";

export function MessagingWorkspace({
  conversations,
  selectedId,
  sidebarOpen,
  onSidebarOpenChange,
  onSelect,
  people,
  agents,
  onMessagePerson,
  onMessageAgent,
  renderCreate,
  loading = false,
  hasLoaded,
  error,
  onRetry,
  children,
}: {
  conversations: Conversation[];
  selectedId?: string;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
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
  hasLoaded: boolean;
  error?: Error | null;
  onRetry: () => void;
  children?: ReactNode;
}) {
  // The dialog is mounted by state, so it has no trigger of its own to return focus to: keep the
  // button that opened it.
  const [creating, setCreating] = useState<{
    kind: Conversation["kind"];
    launcher: HTMLElement | null;
  }>();
  const create = (kind: Conversation["kind"], launcher: HTMLElement | null) =>
    setCreating({ kind, launcher });
  const restoreFocus = () => {
    if (creating?.launcher?.isConnected) creating.launcher.focus();
    else {
      // The empty state's buttons are gone once a conversation exists.
      document
        .querySelector<HTMLElement>(
          '#conversation-sidebar [aria-current="page"], #conversation-sidebar button',
        )
        ?.focus();
    }
  };
  const hasContent = Children.toArray(children).length > 0;
  const blocked = !!error && (!hasLoaded || isAccessFailure(error));
  return (
    <ComposerDraftProvider>
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
            onCreate={create}
          />
          <PageContent>
            {blocked && <PaneState label="Workspace unavailable" error={error} onRetry={onRetry} />}
            {!blocked && error && (
              <p role="status" className="p-3 text-xs text-muted-foreground">
                Conversations may be out of date.
              </p>
            )}
            {!blocked && hasContent && children}
            {!blocked && !hasContent && loading && (
              <PaneState label="Loading your conversations…" />
            )}
            {!blocked && !hasContent && !loading && <WorkspaceEmpty onCreate={create} />}
          </PageContent>
        </PageLayout>
        {creating &&
          renderCreate(creating.kind, {
            onClose: () => setCreating(undefined),
            onRestoreFocus: restoreFocus,
          })}
      </div>
    </ComposerDraftProvider>
  );
}
