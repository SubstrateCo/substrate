import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, PanelLeft } from "lucide-react";
import type { Conversation } from "@/lib/messaging";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-message";
import { ConversationSidebar } from "./conversation-sidebar";
import { ConversationPane } from "./conversation-pane";
import { CreateConversationForm } from "./create-conversation-form";

export function MessagingWorkspace({
  organizationId,
  workspaceName,
}: {
  organizationId: string;
  workspaceName: string;
}) {
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Conversation["kind"] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const visibleConversations = conversations.isError ? [] : conversations.data || [];
  const selected =
    visibleConversations.find((conversation) => conversation.id === selectedId) ??
    (selectedId === null ? visibleConversations[0] : undefined);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-2 py-1 md:hidden">
        <Button
          variant="ghost"
          size="sm"
          aria-controls="conversation-sidebar"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <ArrowLeft /> : <PanelLeft />}
          {sidebarOpen ? "Back to messages" : "Show conversations"}
        </Button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1">
        <ConversationSidebar
          mobileOpen={sidebarOpen}
          workspaceName={workspaceName}
          conversations={visibleConversations}
          selectedId={creating ? undefined : selected?.id}
          onSelect={(id) => {
            setSelectedId(id);
            setCreating(null);
            setSidebarOpen(false);
          }}
          onCreate={(kind) => {
            setCreating(kind);
            setSidebarOpen(false);
          }}
        />
        <div
          className={`${sidebarOpen ? "hidden" : "flex"} min-h-0 min-w-0 flex-1 flex-col md:flex`}
        >
          {conversations.isError && (
            <div className="flex items-start gap-2 border-b p-3">
              <div className="min-w-0 flex-1">
                <FormMessage error={conversations.error} />
              </div>
              <Button variant="outline" onClick={() => void conversations.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {creating ? (
            <CreateConversationForm
              key={creating}
              organizationId={organizationId}
              kind={creating}
              onClose={() => setCreating(null)}
              onCreated={(id) => {
                setSelectedId(id);
                setCreating(null);
              }}
            />
          ) : selected ? (
            <ConversationPane
              key={selected.id}
              organizationId={organizationId}
              conversation={selected}
            />
          ) : conversations.isPending ? (
            <p role="status" className="p-8 text-sm text-muted-foreground">
              Loading your conversations…
            </p>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-600">
                <MessageSquare className="size-8" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Make room for a conversation
              </h1>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Bring your team together in a channel, or start a direct message with someone.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setCreating("channel")}>Create channel</Button>
                <Button variant="outline" onClick={() => setCreating("dm")}>
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
