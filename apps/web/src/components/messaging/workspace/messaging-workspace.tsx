import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";

import { ConversationPane } from "../conversations/conversation-pane";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ContentNotice } from "@/components/feedback/content-notice";
import {
  ChannelCreateActions,
  DirectMessageCreateMenu,
  type DirectMessageAgent,
} from "@/components/messaging/conversations/conversation-create-menu";
import { CreateConversationDialog } from "@/components/messaging/conversations/create-conversation-dialog";
import { MessagingWorkspace as MessagingWorkspaceView } from "@/components/messaging/workspace/messaging-workspace-view";
import { AppAvailability } from "@/components/workspace/app-availability";
import { messageLink } from "@/lib/navigation/record-links";
import type { PickerPerson } from "@/lib/people/people-picker";
import { resourceState } from "@/lib/resource-state";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { useDirectMessage } from "@/queries/messaging/conversations";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { unreadCountsOptions } from "@/queries/messaging/read-state";
import { workspacePeopleQueryOptions } from "@/queries/organizations/people";
import { Unlink } from "lucide-react";
import { toast } from "sonner";

type DirectMessageTarget =
  | { kind: "person"; person: PickerPerson }
  | { kind: "agent"; agent: DirectMessageAgent };

export function MessagingWorkspace({
  organizationId,
  userId,
  conversationId,
  messageId,
  turnId,
}: {
  organizationId: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  turnId?: string;
}) {
  // One list serves every selection, so switching conversations reads nothing again. The list
  // leaves out task discussions; a selected one is read with the list that includes it.
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const { listed, selection, selecting } = useUnlistedSelection(
    organizationId,
    conversations,
    conversationId,
  );
  const unread = useQuery(unreadCountsOptions(organizationId));
  const { people, agents } = useDirectMessageTargets(organizationId, userId);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const open = (id: string) => {
    void navigate({
      to: "/messages",
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
  const sidebarConversations = visibleConversations
    .filter((conversation) => conversation.joined && !conversation.task)
    .map((conversation) => {
      const row = !unread.error
        ? unread.data?.find((item) => item.conversationId === conversation.id)
        : undefined;
      return {
        ...conversation,
        unreadCount: row?.unreadCount ?? 0,
        mentionCount: row?.mentionCount ?? 0,
      };
    });
  const selected = conversationId
    ? (listed ? visibleConversations : (selection.data ?? [])).find(
        (conversation) => conversation.id === conversationId,
      )
    : sidebarConversations[0];
  const pane = selected && (
    <ConversationPane
      key={selected.id}
      organizationId={organizationId}
      conversation={selected}
      userId={userId}
      messageId={messageId}
      turnId={turnId}
    />
  );
  let content: ReactNode;
  if (selected?.task) content = <AppAvailability app="tasks">{pane}</AppAvailability>;
  else if (selected) content = pane;
  else if (conversationId && !selecting)
    content = (
      <ContentNotice
        icon={Unlink}
        title="Conversation unavailable"
        description="It may have been deleted, or you may no longer have access. Check that you’re in the right workspace."
      />
    );
  return (
    <MessagingWorkspaceView
      state={resource.status}
      conversations={sidebarConversations}
      selectedId={selected?.id}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      conversationLink={(id) => messageLink(organizationId, id)}
      onSelect={() => setSidebarOpen(false)}
      loading={conversations.isPending || selecting}
      error={conversations.error}
      onRetry={() => void conversations.refetch()}
      renderSectionActions={(section, onCreate) =>
        section === "channel" ? (
          <ChannelCreateActions onCreate={onCreate} />
        ) : (
          <DirectMessageCreateMenu
            people={people}
            agents={agents}
            onCreate={onCreate}
            onMessagePerson={(person) => messageTarget({ kind: "person", person })}
            onMessageAgent={(agent) => messageTarget({ kind: "agent", agent })}
          />
        )
      }
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
      content={content}
    />
  );
}

/** Reads a selected conversation that the list leaves out, such as a task discussion. */
function useUnlistedSelection(
  organizationId: string,
  conversations: { data?: { id: string }[]; isSuccess: boolean; isPending: boolean },
  conversationId?: string,
) {
  const listed =
    !conversationId || !!conversations.data?.some((item) => item.id === conversationId);
  const selection = useQuery({
    ...conversationsQueryOptions(organizationId, conversationId),
    enabled: !!conversationId && conversations.isSuccess && !listed,
  });
  const selecting = !listed && (conversations.isPending || selection.isPending);
  return { listed, selection, selecting };
}

/** The people and enabled agents the viewer can start a direct message with. */
function useDirectMessageTargets(organizationId: string, userId: string) {
  const workspacePeople = useQuery(workspacePeopleQueryOptions(organizationId));
  const people = (workspacePeople.data ?? []).filter((person) => person.id !== userId);
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const agents = (catalog.data?.agents ?? [])
    .filter((agent) => agent.enabled)
    .map((agent) => ({ id: agent.id, name: agent.name, image: agent.image }));
  return { people, agents };
}
