import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { useState } from "react";

import { ConversationPane } from "../conversations/conversation-pane";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ContentNotice } from "@/components/feedback/content-notice";
import type { DirectMessageAgent } from "@/components/messaging/conversations/conversation-create-menu";
import { CreateConversationDialog } from "@/components/messaging/conversations/create-conversation-dialog";
import { MessagingWorkspace as MessagingWorkspaceView } from "@/components/messaging/workspace/messaging-workspace-view";
import type { PickerPerson } from "@/lib/people/people-picker";
import { resourceState } from "@/lib/resource-state";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { useDirectMessage } from "@/queries/messaging/conversations";
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
  const open = (id: string) => {
    void navigate({
      to: "/dashboard",
      search: { workspaceId: organizationId, conversationId: id },
    });
    setSidebarOpen(false);
  };
  const directMessage = useDirectMessage(organizationId);
  const messageTarget = (target: DirectMessageTarget) => {
    if (directMessage.isPending) return;
    directMessage.mutate(
      target.kind === "agent" ? { agentIds: [target.agent.id] } : { emails: [target.person.email] },
      {
        onSuccess: ({ id }) => open(id),
        onError: (error) =>
          toast.error(actionErrorMessage(error, "We couldn’t open this conversation. Try again.")),
      },
    );
  };
  const resource = resourceState(conversations);
  const visibleConversations = resource.data ?? [];
  // The sidebar lists joined conversations. Other public channels stay reachable by link and search.
  const sidebarConversations = visibleConversations.filter((conversation) => conversation.joined);
  const selected = search.conversationId
    ? visibleConversations.find((conversation) => conversation.id === search.conversationId)
    : sidebarConversations[0];
  return (
    <MessagingWorkspaceView
      state={resource.status}
      conversations={sidebarConversations}
      selectedId={selected?.id}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      onSelect={open}
      loading={conversations.isPending}
      error={conversations.error}
      onRetry={() => void conversations.refetch()}
      people={people}
      agents={agents}
      onMessagePerson={(person) => messageTarget({ kind: "person", person })}
      onMessageAgent={(agent) => messageTarget({ kind: "agent", agent })}
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
