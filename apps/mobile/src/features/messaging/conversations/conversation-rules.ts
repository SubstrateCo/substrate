import { isDirectConversation } from "@substrate/contracts/messaging/input";

import type { Conversation, ConversationMember } from "../types";

type Named = Pick<Conversation, "name" | "kind"> & { task?: Conversation["task"] };

export function conversationName(conversation: Named): string {
  if (conversation.task) return conversation.task.title;
  return conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Only you");
}

export function conversationLabel(conversation: Named & { private: boolean }): string {
  const name = conversationName(conversation);
  return conversation.kind === "channel" && !conversation.private ? `#${name}` : name;
}

export type UnreadRow = { conversationId: string; unreadCount: number; mentionCount: number };
export type SidebarConversation = Conversation & { unreadCount: number; mentionCount: number };

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

export function browsableChannels(conversations: readonly Conversation[]) {
  return conversations.filter(
    (conversation) => conversation.kind === "channel" && !conversation.joined && !conversation.task,
  );
}

export function humanMembers(members: readonly ConversationMember[]) {
  return members.flatMap((member) =>
    member.type === "human" && member.userId ? [{ userId: member.userId, name: member.name }] : [],
  );
}

export function directPartner(conversation: Conversation, viewerId: string) {
  if (!isDirectConversation(conversation.kind)) return undefined;
  const others = conversation.members.filter((member) => member.userId !== viewerId);
  return others.length === 1 ? others[0] : undefined;
}

export function leaveConsequence(conversation: Conversation) {
  return conversation.kind === "channel" && !conversation.private
    ? "It leaves your sidebar and you stop getting reply alerts. Mentions still reach you. You can still open it from links and search, and posting rejoins it."
    : "You lose access to its messages. A member who can manage it must add you back.";
}

export type AgentOption = { agentId: string; name: string; actorId?: string };

export function conversationAgentOptions(
  agents: readonly { id: string; name: string; enabled: boolean }[],
  members: readonly ConversationMember[],
): AgentOption[] {
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

export function agentDirectMessage(conversations: readonly Conversation[], agentId: string) {
  return conversations.find(
    (conversation) =>
      conversation.kind === "agent_dm" &&
      conversation.joined &&
      conversation.members.some((member) => member.type === "agent" && member.agentId === agentId),
  );
}
