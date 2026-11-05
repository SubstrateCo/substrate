import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagingWorkspace as MessagingWorkspaceView } from "@startup-os/ui/messaging/messaging-workspace";
import type { Conversation } from "@/lib/messaging";
import { conversationsQueryOptions } from "@/queries/messaging/options";
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
    <MessagingWorkspaceView
      workspaceName={workspaceName}
      conversations={visibleConversations}
      selectedId={creating ? undefined : selected?.id}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      onSelect={(id) => {
        setSelectedId(id);
        setCreating(null);
        setSidebarOpen(false);
      }}
      onCreate={(kind) => {
        setCreating(kind);
        setSidebarOpen(false);
      }}
      loading={conversations.isPending}
      error={conversations.error}
      onRetry={() => void conversations.refetch()}
    >
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
      ) : undefined}
    </MessagingWorkspaceView>
  );
}
