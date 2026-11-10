import { Children, type ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { ComposerDraftProvider } from "../composer/composer-drafts";
import { ConversationSidebar } from "../conversations/conversation-sidebar";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import type {
  DirectMessageAgent,
  DirectMessagePerson,
} from "@/components/messaging/conversations/conversation-create-menu";
import { useConversationCreation } from "@/components/messaging/workspace/use-conversation-creation";
import { WorkspaceEmpty } from "@/components/messaging/workspace/workspace-empty";
import type { Conversation } from "@/lib/messaging/conversations";
import { ArrowLeft, PanelLeft } from "lucide-react";

export function MessagingWorkspace({
  conversations,
  selectedId,
  sidebarOpen,
  onSidebarOpenChange,
  onSelect,
  people,
  agents,
  onMessageAgent,
  renderCreate,
  initialCreating,
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
  people?: DirectMessagePerson[];
  agents?: DirectMessageAgent[];
  onMessageAgent?: (agent: DirectMessageAgent) => void;
  renderCreate: (
    kind: Conversation["kind"],
    actions: { onCancel: () => void; onComplete: () => void; recipient?: string },
  ) => ReactNode;
  initialCreating?: Conversation["kind"];
  loading?: boolean;
  hasLoaded: boolean;
  error?: Error | null;
  onRetry: () => void;
  children?: ReactNode;
}) {
  const { creating, recipient, setCreating, container, beginCreate, cancelCreate } =
    useConversationCreation(initialCreating, sidebarOpen, onSidebarOpenChange);
  const hasContent = !!creating || Children.toArray(children).length > 0;
  const blocked = !!error && (!hasLoaded || isAccessFailure(error));
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
            selectedId={creating ? undefined : selectedId}
            people={people}
            agents={agents}
            onMessageAgent={
              onMessageAgent &&
              ((agent) => {
                setCreating(undefined);
                onMessageAgent(agent);
              })
            }
            onSelect={(id) => {
              setCreating(undefined);
              onSelect(id);
            }}
            onCreate={(kind, nextRecipient) => beginCreate(kind, "sidebar", nextRecipient)}
          />
          <PageContent>
            {blocked && <PaneState label="Workspace unavailable" error={error} onRetry={onRetry} />}
            {!blocked && error && (
              <p role="status" className="p-3 text-xs text-muted-foreground">
                Conversations may be out of date.
              </p>
            )}
            {!blocked && hasContent && (
              <>
                {creating
                  ? renderCreate(creating, {
                      onCancel: cancelCreate,
                      onComplete: () => setCreating(undefined),
                      recipient,
                    })
                  : children}
              </>
            )}
            {!blocked && !hasContent && loading && (
              <PaneState label="Loading your conversations…" />
            )}
            {!blocked && !hasContent && !loading && (
              <WorkspaceEmpty onCreate={(kind) => beginCreate(kind, "empty")} />
            )}
          </PageContent>
        </PageLayout>
      </div>
    </ComposerDraftProvider>
  );
}
