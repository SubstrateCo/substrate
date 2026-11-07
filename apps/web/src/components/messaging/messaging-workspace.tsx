import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { ConversationPane } from "./conversation-pane";
import { CreateConversationForm } from "./create-conversation-form";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { ConversationUnavailable } from "@/components/messaging/conversation-unavailable";
import { MessagingWorkspace as MessagingWorkspaceView } from "@/components/messaging/messaging-workspace-view";
import { conversationsQueryOptions } from "@/queries/messaging/options";

export function MessagingWorkspace({ organizationId }: { organizationId: string }) {
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const visibleConversations = isAccessFailure(conversations.error) ? [] : conversations.data || [];
  const selected = search.conversationId
    ? visibleConversations.find((conversation) => conversation.id === search.conversationId)
    : visibleConversations[0];
  return (
    <MessagingWorkspaceView
      conversations={visibleConversations}
      selectedId={selected?.id}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      onSelect={(id) => {
        void navigate({
          to: "/dashboard",
          search: { workspaceId: organizationId, conversationId: id },
        });
        setSidebarOpen(false);
      }}
      loading={conversations.isPending}
      error={conversations.error}
      onRetry={() => void conversations.refetch()}
      renderCreate={(kind, { onCancel, onComplete }) => (
        <CreateConversationForm
          key={kind}
          organizationId={organizationId}
          kind={kind}
          onCancel={onCancel}
          onCreated={(id) => {
            void navigate({
              to: "/dashboard",
              search: { workspaceId: organizationId, conversationId: id },
            });
            onComplete();
          }}
        />
      )}
    >
      {selected && (
        <ConversationPane
          key={selected.id}
          organizationId={organizationId}
          conversation={selected}
        />
      )}
      {search.conversationId && !selected && !conversations.isPending && (
        <ConversationUnavailable />
      )}
    </MessagingWorkspaceView>
  );
}
