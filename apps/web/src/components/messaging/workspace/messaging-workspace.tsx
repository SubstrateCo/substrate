import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { ConversationPane } from "../conversations/conversation-pane";
import { createConversation } from "@/api/messaging/requests";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ContentNotice } from "@/components/feedback/content-notice";
import { isAccessFailure } from "@/components/feedback/request-failure";
import type { DirectMessageAgent } from "@/components/messaging/conversations/conversation-create-menu";
import { CreateConversationDialog } from "@/components/messaging/conversations/create-conversation-dialog";
import { MessagingWorkspace as MessagingWorkspaceView } from "@/components/messaging/workspace/messaging-workspace-view";
import { agentDirectMessage } from "@/lib/messaging/conversations";
import type { PickerPerson } from "@/lib/people/people-picker";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { queryKeys } from "@/queries/keys";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { workspacePeopleQueryOptions } from "@/queries/organizations/people";
import { Unlink } from "lucide-react";
import { toast } from "sonner";

type DirectMessageTarget =
  | { kind: "person"; person: PickerPerson }
  | { kind: "agent"; agent: DirectMessageAgent };

export function MessagingWorkspace({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const workspacePeople = useQuery(workspacePeopleQueryOptions(organizationId));
  const people = (workspacePeople.data ?? []).filter((person) => person.id !== userId);
  const catalog = useQuery(agentCatalogQueryOptions(userId));
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
  // The server returns an existing DM with the same person instead of creating another one.
  const directMessage = useMutation({
    mutationFn: async (target: DirectMessageTarget) => {
      if (target.kind === "agent") {
        const existing = agentDirectMessage(conversations.data ?? [], target.agent.id);
        if (existing) return existing.id;
      }
      const created = await createConversation({
        data: {
          organizationId,
          kind: "dm",
          private: true,
          ...(target.kind === "agent"
            ? { agentIds: [target.agent.id] }
            : { emails: [target.person.email] }),
        },
      });
      return created.id;
    },
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
      onSelect={open}
      loading={conversations.isPending}
      hasLoaded={conversations.data !== undefined}
      error={conversations.error}
      onRetry={() => void conversations.refetch()}
      people={people}
      agents={agents}
      onMessagePerson={(person) => {
        if (!directMessage.isPending) directMessage.mutate({ kind: "person", person });
      }}
      onMessageAgent={(agent) => {
        if (!directMessage.isPending) directMessage.mutate({ kind: "agent", agent });
      }}
      renderCreate={(kind, { onClose, onRestoreFocus }) => (
        <CreateConversationDialog
          organizationId={organizationId}
          kind={kind}
          people={people}
          onClose={onClose}
          onRestoreFocus={onRestoreFocus}
          onCreated={(id) => {
            open(id);
            onClose();
          }}
        />
      )}
    >
      {selected && (
        <ConversationPane
          key={selected.id}
          organizationId={organizationId}
          conversation={selected}
          userId={userId}
        />
      )}
      {search.conversationId && !selected && !conversations.isPending && (
        <ContentNotice
          icon={Unlink}
          title="Conversation unavailable"
          description="It may have been deleted, or you may no longer have access. Check that you’re in the right workspace."
        />
      )}
    </MessagingWorkspaceView>
  );
}
