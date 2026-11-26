import type {
  Conversation,
  ConversationMember,
  ManagedConversation,
  WorkspacePerson,
} from "../types";

type Named = Pick<Conversation, "name" | "kind"> & { task?: Conversation["task"] };

// The server names unnamed DMs and groups after their other members.
export function conversationName(conversation: Named): string {
  if (conversation.task) return conversation.task.title;
  return conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Only you");
}

/** Running text: only a public channel gets "#". */
export function conversationLabel(conversation: Named & { private: boolean }): string {
  const name = conversationName(conversation);
  return conversation.kind === "channel" && !conversation.private ? `#${name}` : name;
}

export type UnreadRow = { conversationId: string; unreadCount: number; mentionCount: number };
export type SidebarConversation = Conversation & { unreadCount: number; mentionCount: number };

/** Joined conversations in the sidebar's sections. Task discussions live with their task. */
export function sidebarSections(
  conversations: readonly Conversation[],
  unread: readonly UnreadRow[] = [],
) {
  const rows: SidebarConversation[] = conversations.flatMap((conversation) => {
    if (!conversation.joined || conversation.task) return [];
    const counts = unread.find((row) => row.conversationId === conversation.id);
    return [
      {
        ...conversation,
        unreadCount: counts?.unreadCount ?? 0,
        mentionCount: counts?.mentionCount ?? 0,
      },
    ];
  });
  return {
    channels: rows.filter((row) => row.kind === "channel" && !row.partner),
    partner: rows.filter((row) => row.kind === "channel" && row.partner),
    direct: rows.filter((row) => row.kind !== "channel"),
  };
}

/** Public channels the person can read but has not joined or has left. */
export function browsableChannels(conversations: readonly Conversation[]) {
  return conversations.filter(
    (conversation) => conversation.kind === "channel" && !conversation.joined && !conversation.task,
  );
}

// Only people can own, leave, or receive a conversation. Agents are members without a user.
export function humanMembers(members: readonly ConversationMember[]) {
  return members.flatMap((member) =>
    member.type === "human" && member.userId ? [{ userId: member.userId, name: member.name }] : [],
  );
}

export function directPartner(conversation: Conversation, viewerId: string) {
  if (conversation.kind !== "dm") return undefined;
  const others = conversation.members.filter((member) => member.userId !== viewerId);
  return others.length === 1 ? others[0] : undefined;
}

export function canAddMembers(conversation: Conversation) {
  return !conversation.task && conversation.kind !== "dm" && conversation.canManage;
}

export function canLeave(conversation: Conversation) {
  return !conversation.task && conversation.kind !== "dm" && conversation.joined;
}

/** Managers remove people of the host organization, never themselves or the owner. */
export function canRemoveMember(
  conversation: Conversation,
  viewerId: string,
  member: ConversationMember,
) {
  return (
    canAddMembers(conversation) &&
    member.type === "human" &&
    member.organizationId === conversation.organizationId &&
    member.userId !== viewerId &&
    member.userId !== conversation.createdBy
  );
}

/** The owner leaving must hand ownership to another person first, when there is one. */
export function leaveOwnerCandidates(conversation: Conversation, viewerId: string) {
  const owner = conversation.createdBy === viewerId && conversation.canManage;
  if (!owner) return [];
  return ownerCandidates(conversation);
}

/** Ownership stays in the host organization, even when partners share the conversation. */
export function ownerCandidates(
  conversation: Pick<Conversation, "members" | "organizationId" | "createdBy">,
) {
  return humanMembers(
    conversation.members.filter((member) => member.organizationId === conversation.organizationId),
  ).filter((person) => person.userId !== conversation.createdBy);
}

/** Managed metadata omits organization IDs. Only current host-directory members can own it. */
export function managedOwnerCandidates(
  conversation: Pick<ManagedConversation, "members" | "ownerUserId">,
  people: readonly Pick<WorkspacePerson, "userId" | "name">[],
) {
  const memberIds = new Set(
    conversation.members.flatMap((member) =>
      member.type === "human" && member.userId ? [member.userId] : [],
    ),
  );
  return people.filter(
    (person) => memberIds.has(person.userId) && person.userId !== conversation.ownerUserId,
  );
}

/** Add-members never adds its acting user; do not offer a no-op self-add to metadata-only admins. */
export function managedMemberChoices(
  people: readonly Pick<WorkspacePerson, "userId" | "name" | "email" | "image">[],
  members: readonly Pick<ConversationMember, "userId">[],
  viewerId: string,
) {
  const memberIds = new Set(members.flatMap((member) => (member.userId ? [member.userId] : [])));
  return people.flatMap((person) =>
    person.userId !== viewerId && !memberIds.has(person.userId)
      ? [{ id: person.userId, name: person.name, email: person.email, image: person.image }]
      : [],
  );
}

export function leaveConsequence(conversation: Conversation) {
  return conversation.kind === "channel" && !conversation.private
    ? "It leaves your sidebar and you stop getting reply alerts. Mentions still reach you. You can still open it from links and search, and posting rejoins it."
    : "You lose access to its messages. A member who can manage it must add you back.";
}

export type AgentOption = { agentId: string; name: string; actorId?: string };

/**
 * Joins the viewer's enabled agents with their agent members here. Members that match no enabled
 * agent stay removable.
 */
export function conversationAgentOptions(
  agents: readonly { id: string; name: string; enabled: boolean }[],
  members: readonly ConversationMember[],
): AgentOption[] {
  // The server sets agentId only for the viewer's own agents.
  const own = members.filter((member) => member.type === "agent" && member.agentId);
  const matched = new Set<string>();
  const options = agents.flatMap((agent): AgentOption[] => {
    if (!agent.enabled) return [];
    const member = own.find((entry) => entry.agentId === agent.id);
    if (member) matched.add(member.actorId);
    return [{ agentId: agent.id, name: agent.name, actorId: member?.actorId }];
  });
  return [
    ...options,
    ...own.flatMap((member): AgentOption[] =>
      matched.has(member.actorId)
        ? []
        : [
            {
              agentId: member.agentId ?? member.actorId,
              name: member.name,
              actorId: member.actorId,
            },
          ],
    ),
  ];
}

/** The viewer's open DM with their agent, so a new message reuses it. */
export function agentDirectMessage(conversations: readonly Conversation[], agentId: string) {
  return conversations.find(
    (conversation) =>
      conversation.kind === "dm" &&
      conversation.joined &&
      conversation.members.some((member) => member.type === "agent" && member.agentId === agentId),
  );
}
