import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagingWorkspace as MessagingWorkspaceView } from "@startup-os/ui/messaging/messaging-workspace";
import type { Conversation } from "@/lib/messaging";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { ConversationPane } from "./conversation-pane";
import { CreateConversationForm } from "./create-conversation-form";
import { isAccessFailure } from "@startup-os/ui/feedback/request-failure";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ConversationUnavailable } from "@startup-os/ui/messaging/conversation-unavailable";

export function MessagingWorkspace({ organizationId }: { organizationId: string }) {
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Conversation["kind"] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const visibleConversations = isAccessFailure(conversations.error) ? [] : conversations.data || [];
  const selected =
    visibleConversations.find(
      (conversation) => conversation.id === (search.conversationId ?? selectedId),
    ) ?? (!search.conversationId && selectedId === null ? visibleConversations[0] : undefined);
  return (
    <MessagingWorkspaceView
      conversations={visibleConversations}
      selectedId={creating ? undefined : selected?.id}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      onSelect={(id) => {
        setSelectedId(id);
        void navigate({
          to: "/dashboard",
          search: { workspaceId: organizationId, conversationId: id },
        });
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
      {creating && (
        <CreateConversationForm
          key={creating}
          organizationId={organizationId}
          kind={creating}
          onCreated={(id) => {
            setSelectedId(id);
            void navigate({
              to: "/dashboard",
              search: { workspaceId: organizationId, conversationId: id },
            });
            setCreating(null);
          }}
        />
      )}
      {!creating && selected && (
        <ConversationPane
          key={selected.id}
          organizationId={organizationId}
          conversation={selected}
        />
      )}
      {!creating && search.conversationId && !selected && !conversations.isPending && (
        <ConversationUnavailable />
      )}
    </MessagingWorkspaceView>
  );
}
