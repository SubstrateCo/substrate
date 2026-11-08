import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { ConversationPane } from "../conversations/conversation-pane";
import { CreateConversationForm } from "../conversations/create-conversation-form";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { ConversationUnavailable } from "@/components/messaging/conversations/conversation-unavailable";
import { MessagingWorkspace as MessagingWorkspaceView } from "@/components/messaging/workspace/messaging-workspace-view";
import { sessionQueryOptions } from "@/queries/auth/session";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { organizationQueryOptions } from "@/queries/organizations/options";

export function MessagingWorkspace({ organizationId }: { organizationId: string }) {
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const session = useQuery({ ...sessionQueryOptions(), staleTime: Infinity });
  const organization = useQuery(organizationQueryOptions(organizationId));
  const people = (organization.data?.members ?? [])
    .filter((member) => member.userId !== session.data?.user.id)
    .map((member) => ({
      id: member.userId,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
      hasLoaded={conversations.data !== undefined}
      error={conversations.error}
      onRetry={() => void conversations.refetch()}
      people={people}
      renderCreate={(kind, { onCancel, onComplete, recipient }) => (
        <CreateConversationForm
          key={`${kind}:${recipient ?? ""}`}
          organizationId={organizationId}
          kind={kind}
          initialEmails={recipient}
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
