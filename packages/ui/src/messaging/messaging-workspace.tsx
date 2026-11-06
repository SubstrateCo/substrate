import { Children, useEffect, useRef, useState, type ReactNode } from "react";
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
  renderCreate,
  initialCreating,
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
  renderCreate: (
    kind: Conversation["kind"],
    actions: { onCancel: () => void; onComplete: () => void },
  ) => ReactNode;
  initialCreating?: Conversation["kind"];
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  children?: ReactNode;
}) {
  const [creating, setCreating] = useState(initialCreating);
  const container = useRef<HTMLDivElement>(null);
  const [returnFocus, setReturnFocus] = useState<{
    element: Element | null;
    fallback: string;
    sidebarOpen: boolean;
  } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const appliedFocus = useRef(0);
  const beginCreate = (kind: Conversation["kind"], source: "sidebar" | "empty") => {
    setReturnFocus({
      element: document.activeElement,
      fallback: `${source}-${source === "sidebar" && kind !== "channel" ? "message" : kind}`,
      sidebarOpen,
    });
    setCreating(kind);
    onSidebarOpenChange(false);
  };
  const cancelCreate = () => {
    setFocusRequest((previous) => previous + 1);
    onSidebarOpenChange(returnFocus?.sidebarOpen ?? false);
    setCreating(undefined);
  };
  useEffect(() => {
    if (creating || focusRequest <= appliedFocus.current) return;
    appliedFocus.current = focusRequest;
    const previous = returnFocus;
    const original = previous?.element;
    const fallback = container.current?.querySelector<HTMLElement>(
      `[data-create-conversation="${previous?.fallback ?? "sidebar-channel"}"]`,
    );
    const target =
      original instanceof HTMLElement &&
      original !== document.body &&
      original.isConnected &&
      original.getClientRects().length
        ? original
        : fallback;
    target?.focus();
  }, [creating, focusRequest, returnFocus]);
  const hasContent = !!creating || Children.toArray(children).length > 0;
  const blocked = !!error && (!hasContent || isAccessFailure(error));
  return (
    <ComposerDraftProvider>
      <div ref={container} className="flex min-h-0 min-w-0 flex-1 flex-col">
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
              selectedId={creating ? undefined : selectedId}
              onSelect={(id) => {
                setCreating(undefined);
                onSelect(id);
              }}
              onCreate={(kind) => beginCreate(kind, "sidebar")}
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
                {creating
                  ? renderCreate(creating, {
                      onCancel: cancelCreate,
                      onComplete: () => setCreating(undefined),
                    })
                  : children}
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
                  <Button
                    data-create-conversation="empty-channel"
                    onClick={() => beginCreate("channel", "empty")}
                  >
                    Create channel
                  </Button>
                  <Button
                    data-create-conversation="empty-dm"
                    variant="outline"
                    onClick={() => beginCreate("dm", "empty")}
                  >
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
