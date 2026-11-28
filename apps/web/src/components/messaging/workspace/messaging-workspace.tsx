import type { PickerAgent, PickerPerson } from "@substrate/contracts/people/picker";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useEffect, useState } from "react";

import { ConversationPane } from "../conversations/conversation-pane";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ContentNotice } from "@/components/feedback/content-notice";
import {
  ChannelCreateActions,
  DirectMessageCreateMenu,
} from "@/components/messaging/conversations/conversation-create-menu";
import { CreateConversationDialog } from "@/components/messaging/conversations/create-conversation-dialog";
import {
  MessagingWorkspace as MessagingWorkspaceView,
  WorkspaceLoading,
} from "@/components/messaging/workspace/messaging-workspace-view";
import { WorkspaceEmpty } from "@/components/messaging/workspace/workspace-empty";
import { AppAvailability } from "@/components/workspace/app-availability";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { Conversation } from "@/lib/messaging/conversations";
import { messageLink, type MessageSource } from "@/lib/navigation/record-links";
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
  | { kind: "agent"; agent: PickerAgent };

export function MessagingWorkspace({
  conversationId,
  messageId,
  turnId,
  source,
  sheet,
}: {
  conversationId?: string;
  messageId?: string;
  turnId?: string;
  source?: MessageSource;
  sheet?: boolean;
}) {
  const { organizationId, userId } = useWorkspaceScope();
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const { listed, selection, selecting } = useUnlistedSelection(
    organizationId,
    conversations,
    conversationId,
  );
  const unread = useQuery(unreadCountsOptions(organizationId));
  const { people, agents } = useDirectMessageTargets(organizationId, userId);
  const navigate = useNavigate({ from: "/messages" });
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
  const selectedId = selected?.id;
  useEffect(() => {
    if (!conversationId && selectedId)
      void navigate({
        to: "/messages",
        search: (previous) => ({ ...previous, conversationId: selectedId }),
        replace: true,
        resetScroll: false,
      });
  }, [conversationId, navigate, selectedId]);
  const loading = conversations.isPending || selecting;
  return (
    <MessagingWorkspaceView
      state={resource.status}
      conversations={sidebarConversations}
      selectedId={selected?.id}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      conversationLink={(id) => messageLink(organizationId, id)}
      onSelect={() => setSidebarOpen(false)}
      loading={loading}
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
          kind={kind}
          onClose={onClose}
          onRestoreFocus={onRestoreFocus}
          onCreated={(id) => {
            open(id);
            onClose();
          }}
        />
      )}
      renderContent={(onCreate) => (
        <WorkspaceSelection
          selected={selected}
          messageId={messageId}
          turnId={turnId}
          source={source}
          sheet={sheet}
          missing={!!conversationId && !selecting}
          loading={loading}
          onCreate={onCreate}
        />
      )}
    />
  );
}

function WorkspaceSelection({
  selected,
  messageId,
  turnId,
  source,
  sheet,
  missing,
  loading,
  onCreate,
}: {
  selected?: Conversation;
  messageId?: string;
  turnId?: string;
  source?: MessageSource;
  sheet?: boolean;
  missing: boolean;
  loading: boolean;
  onCreate: (kind: Conversation["kind"]) => void;
}) {
  if (selected) {
    const pane = (
      <ConversationPane
        key={selected.id}
        conversation={selected}
        messageId={messageId}
        turnId={turnId}
        source={source}
        sheet={sheet}
      />
    );
    if (selected.task) return <AppAvailability app="tasks">{pane}</AppAvailability>;
    return pane;
  }
  if (missing)
    return (
      <ContentNotice
        icon={Unlink}
        title="Conversation unavailable"
        description="It may have been deleted, or you may no longer have access. Check that you’re in the right workspace."
      />
    );
  if (loading) return <WorkspaceLoading />;
  return <WorkspaceEmpty onCreate={onCreate} />;
}

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

function useDirectMessageTargets(organizationId: string, userId: string) {
  const workspacePeople = useQuery(workspacePeopleQueryOptions(organizationId));
  const people = (workspacePeople.data ?? []).filter((person) => person.id !== userId);
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const agents = (catalog.data?.agents ?? [])
    .filter((agent) => agent.enabled)
    .map((agent) => ({ id: agent.id, name: agent.name, avatar: agent.avatar }));
  return { people, agents };
}
