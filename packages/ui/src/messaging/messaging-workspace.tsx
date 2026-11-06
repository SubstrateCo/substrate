import { Children, type ReactNode } from "react";
import { ArrowLeft, PanelLeft } from "lucide-react";
import { ContentNotice } from "../feedback/content-notice";
import { ComposerDraftProvider } from "./composer-drafts";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../primitives/resizable";
import type { Conversation } from "./types";
import { Button } from "../primitives/button";
import { PaneState } from "../feedback/pane-state";
import { ConversationSidebar } from "./conversation-sidebar";
import { isAccessFailure } from "../feedback/request-failure";
import { ErrorState } from "../feedback/error-state";

export function MessagingWorkspace({
  conversations,
  selectedId,
  sidebarOpen,
  onSidebarOpenChange,
  onSelect,
  onCreate,
  loading = false,
  error,
  onRetry,
  children,
}: {
  conversations: Conversation[];
  selectedId?: string;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onCreate: (kind: Conversation["kind"]) => void;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  children?: ReactNode;
}) {
  const hasContent = Children.toArray(children).length > 0;
  const blocked = !!error && (!hasContent || isAccessFailure(error));
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
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 min-w-0 flex-1 max-md:contents! max-md:*:data-panel:contents!"
        >
          <ResizablePanel
            id="conversations"
            defaultSize={240}
            minSize={180}
            maxSize={360}
            className="max-md:contents!"
          >
            <ConversationSidebar
              mobileOpen={sidebarOpen}
              loading={loading}
              error={error}
              onRetry={onRetry}
              conversations={conversations}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreate={onCreate}
            />
          </ResizablePanel>
          <ResizableHandle aria-label="Resize conversations sidebar" className="max-md:hidden" />
          <ResizablePanel
            id="conversation"
            minSize={320}
            className={`${sidebarOpen ? "max-md:hidden!" : "flex"} min-h-0 min-w-0 flex-1 flex-col md:flex`}
          >
            {blocked && <PaneState label="Workspace unavailable" error={error} onRetry={onRetry} />}
            {!blocked && hasContent && (
              <>
                {error && (
                  <div className="p-3">
                    <ErrorState
                      compact
                      title="Couldn’t refresh conversations"
                      description="You can still read your loaded messages. Try again to update the conversation list."
                      onRetry={onRetry}
                    />
                  </div>
                )}
                {children}
              </>
            )}
            {!blocked && !hasContent && loading && (
              <PaneState label="Loading your conversations…" />
            )}
            {!blocked && !hasContent && !loading && (
              <div className="m-auto flex max-w-md flex-col items-center p-6 text-center">
                <ContentNotice
                  title="Your conversations start here"
                  description="Create a channel for your team, or send someone a direct message."
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => onCreate("channel")}>Create channel</Button>
                  <Button variant="outline" onClick={() => onCreate("dm")}>
                    New direct message
                  </Button>
                </div>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ComposerDraftProvider>
  );
}
