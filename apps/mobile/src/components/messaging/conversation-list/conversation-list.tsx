import { useState } from "react";

import { SharingRequestsSheet } from "../sharing/sharing-requests-sheet";
import { BrowseChannelsSheet } from "./browse-channels-sheet";
import { ConversationListView } from "./conversation-list-view";
import { CreateConversationForm } from "./create-conversation-form";
import { ManagedConversationsSheet } from "./managed-conversations-sheet";
import { NewConversationSheet, type NewConversationChoice } from "./new-conversation-sheet";
import {
  browsableChannels,
  sidebarSections,
} from "@/features/messaging/conversations/conversation-rules";
import { recipientEmails } from "@/features/messaging/conversations/recipients";
import {
  useCreateConversation,
  useJoinChannel,
} from "@/features/messaging/queries/use-conversation-management";
import {
  useConversations,
  useOwnAgents,
  useUnreadCounts,
  useWorkspacePeople,
} from "@/features/messaging/queries/use-conversations";
import { useConversationAdminAccess } from "@/features/messaging/queries/use-managed-conversations";
import { useSharingInbox } from "@/features/messaging/queries/use-sharing";
import { useMessagingScope } from "@/features/messaging/scope";
import type { ConversationKind } from "@/features/messaging/types";

type Panel =
  | { kind: "new" }
  | { kind: "create"; conversation: Exclude<ConversationKind, "agent_dm"> }
  | { kind: "browse" }
  | { kind: "manage" }
  | { kind: "invitations" };

export function ConversationList({
  organizationId,
  selectedId,
  onSelect,
  onClose,
}: {
  organizationId: string;
  selectedId?: string;
  onSelect: (conversationId: string) => void;
  onClose?: () => void;
}) {
  const { userId } = useMessagingScope(organizationId);
  const conversations = useConversations(organizationId);
  const unread = useUnreadCounts(organizationId);
  const inbox = useSharingInbox(organizationId);
  const admin = useConversationAdminAccess(organizationId);
  const [panel, setPanel] = useState<Panel>();
  const people = useWorkspacePeople(organizationId);
  const agents = useOwnAgents(organizationId);
  const create = useCreateConversation(organizationId);
  const join = useJoinChannel(organizationId);
  const browsable = browsableChannels(conversations.data ?? []);

  const open = (id: string) => {
    setPanel(undefined);
    onSelect(id);
  };
  const choose = (choice: NewConversationChoice) => {
    if (choice.kind === "create")
      return setPanel({ kind: "create", conversation: choice.conversation });
    if (choice.kind === "browse") return setPanel({ kind: "browse" });
    create.mutate(
      choice.kind === "person"
        ? { kind: "dm", emails: [choice.person.email] }
        : { kind: "agent_dm", agentIds: [choice.agent.id] },
      { onSuccess: ({ id }) => open(id) },
    );
  };

  return (
    <>
      <ConversationListView
        sections={
          conversations.data && sidebarSections(conversations.data, unread.error ? [] : unread.data)
        }
        viewerId={userId}
        selectedId={selectedId}
        loading={conversations.isPending}
        error={conversations.error}
        browsableCount={browsable.length}
        invitationCount={inbox.data?.length ?? 0}
        onRetry={() => void conversations.refetch()}
        onSelect={onSelect}
        onNew={() => {
          create.reset();
          setPanel({ kind: "new" });
        }}
        onBrowse={() => setPanel({ kind: "browse" })}
        onManage={admin.allowed ? () => setPanel({ kind: "manage" }) : undefined}
        onInvitations={() => setPanel({ kind: "invitations" })}
        onClose={onClose}
      />
      {panel?.kind === "new" ? (
        <NewConversationSheet
          people={people.data ?? []}
          agents={(agents.data ?? [])
            .filter((agent) => agent.enabled)
            .map(({ id, name, avatar }) => ({ id, name, avatar }))}
          pending={create.isPending}
          error={create.error ?? people.error}
          canBrowse={browsable.length > 0}
          onChoose={choose}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel?.kind === "create" ? (
        <CreateConversationForm
          kind={panel.conversation}
          people={people.data ?? []}
          pending={create.isPending}
          error={create.error}
          onClose={() => setPanel(undefined)}
          onSubmit={({ name, recipients, isPrivate, shareHistory }) =>
            create.mutate(
              {
                kind: panel.conversation,
                name: name.trim() || undefined,
                private: isPrivate,
                emails: recipientEmails(recipients),
                shareHistory,
              },
              { onSuccess: ({ id }) => open(id) },
            )
          }
        />
      ) : null}
      {panel?.kind === "browse" ? (
        <BrowseChannelsSheet
          channels={browsable}
          joiningId={join.isPending ? join.variables : undefined}
          error={join.error}
          onOpen={open}
          onJoin={(id) => join.mutate(id, { onSuccess: () => open(id) })}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel?.kind === "invitations" ? (
        <SharingRequestsSheet
          organizationId={organizationId}
          requests={inbox.data ?? []}
          onOpenConversation={open}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel?.kind === "manage" && admin.allowed ? (
        <ManagedConversationsSheet
          organizationId={organizationId}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
    </>
  );
}
