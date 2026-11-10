import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { ConversationPane } from "../conversations/conversation-pane";
import { CreateConversationForm } from "../conversations/create-conversation-form";
import { createConversation } from "@/api/messaging/requests";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { isAccessFailure } from "@/components/feedback/request-failure";
import type { DirectMessageAgent } from "@/components/messaging/conversations/conversation-create-menu";
import { ConversationUnavailable } from "@/components/messaging/conversations/conversation-unavailable";
import { MessagingWorkspace as MessagingWorkspaceView } from "@/components/messaging/workspace/messaging-workspace-view";
import { agentDirectMessage } from "@/lib/messaging/conversations";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { sessionQueryOptions } from "@/queries/auth/session";
import { queryKeys } from "@/queries/keys";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { organizationQueryOptions } from "@/queries/organizations/options";
import { toast } from "sonner";

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
  const userId = session.data?.user.id;
  const catalog = useQuery({ ...agentCatalogQueryOptions(userId ?? ""), enabled: !!userId });
  const agents = (catalog.data?.agents ?? [])
    .filter((agent) => agent.enabled)
    .map((agent) => ({ id: agent.id, name: agent.name, image: agent.image }));
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();
  const open = (id: string) => {
    void navigate({
      to: "/dashboard",
      search: { workspaceId: organizationId, conversationId: id },
    });
    setSidebarOpen(false);
  };
  const messageAgent = useMutation({
    mutationFn: async (agent: DirectMessageAgent) =>
      agentDirectMessage(conversations.data ?? [], agent.id)?.id ??
      (
        await createConversation({
          data: { organizationId, kind: "dm", private: true, agentIds: [agent.id] },
        })
      ).id,
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) });
      open(id);
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error, "We couldn’t open this conversation. Try again.")),
  });
  const visibleConversations = isAccessFailure(conversations.error) ? [] : conversations.data || [];
  // The sidebar lists joined conversations. Other public channels stay reachable by link and search.
  const sidebarConversations = visibleConversations.filter((conversation) => conversation.joined);
  const selected = search.conversationId
    ? visibleConversations.find((conversation) => conversation.id === search.conversationId)
    : sidebarConversations[0];
  return (
    <MessagingWorkspaceView
      conversations={sidebarConversations}
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
      agents={agents}
      onMessageAgent={(agent) => {
        if (!messageAgent.isPending) messageAgent.mutate(agent);
      }}
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
          userId={session.data?.user.id}
        />
      )}
      {search.conversationId && !selected && !conversations.isPending && (
        <ConversationUnavailable />
      )}
    </MessagingWorkspaceView>
  );
}
