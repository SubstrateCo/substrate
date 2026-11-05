import type { ReactNode } from "react";
import { ArrowLeft, MessageSquare, PanelLeft } from "lucide-react";
import type { Conversation } from "./types";
import { Button } from "../primitives/button";
import { PaneState } from "../feedback/pane-state";
import { ConversationSidebar } from "./conversation-sidebar";

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
      <div className="flex min-h-0 min-w-0 flex-1">
        <ConversationSidebar
          mobileOpen={sidebarOpen}
          loading={loading}
          conversations={conversations}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreate={onCreate}
        />
        <div
          className={`${sidebarOpen ? "hidden" : "flex"} min-h-0 min-w-0 flex-1 flex-col md:flex`}
        >
          {error ? (
            <PaneState label="Workspace unavailable" error={error} onRetry={onRetry} />
          ) : children ? (
            children
          ) : loading ? (
            <PaneState label="Loading your conversations…" />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="rounded-2xl border border-primary/10 bg-accent p-4 text-accent-foreground shadow-raised">
                <MessageSquare className="size-8" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Make room for a conversation
              </h1>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Bring your team together in a channel, or start a direct message with someone.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => onCreate("channel")}>Create channel</Button>
                <Button variant="outline" onClick={() => onCreate("dm")}>
                  New direct message
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
