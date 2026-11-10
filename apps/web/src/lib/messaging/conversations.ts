export type ConversationMember = {
  actorId: string;
  type: "human" | "agent";
  userId: string | null;
  /** The agent definition ID, only for the viewer's own agents. */
  agentId?: string | null;
  name: string;
};

export type Conversation = {
  id: string;
  kind: "dm" | "group" | "channel";
  name: string | null;
  private: boolean;
  partner?: boolean;
  createdBy?: string;
  members?: ConversationMember[];
  // Active member. Public channels the person never joined or left stay readable but leave the sidebar.
  joined?: boolean;
  canManage?: boolean;
  canShare?: boolean;
};

export function conversationName(conversation: Conversation): string {
  return (
    conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Direct message")
  );
}

/**
 * Joins the viewer's enabled agents with their agent members here, by agent definition ID.
 * Members that match no enabled agent stay removable.
 */
export function conversationAgentOptions(
  agents: readonly { id: string; name: string; enabled: boolean }[],
  members: readonly { id: string; title: string; agentId?: string }[],
): { agentId: string; name: string; actorId?: string }[] {
  const matched = new Set<string>();
  const options = agents.flatMap((agent) => {
    if (!agent.enabled) return [];
    const member = members.find((entry) => entry.agentId === agent.id);
    if (member) matched.add(member.id);
    return [{ agentId: agent.id, name: agent.name, actorId: member?.id }];
  });
  return [
    ...options,
    ...members.flatMap((member) =>
      matched.has(member.id)
        ? []
        : [{ agentId: member.agentId ?? member.id, name: member.title, actorId: member.id }],
    ),
  ];
}

/** The viewer's open DM with their agent, so a new message reuses it. */
export function agentDirectMessage(conversations: readonly Conversation[], agentId: string) {
  return conversations.find(
    (conversation) =>
      conversation.kind === "dm" &&
      conversation.joined &&
      conversation.members?.some((member) => member.type === "agent" && member.agentId === agentId),
  );
}

// Only people can own, leave, or receive a conversation. Agents are members without a user.
export function humanMembers(members: ConversationMember[] = []) {
  return members.flatMap((member) =>
    member.type === "human" && member.userId ? [{ userId: member.userId, name: member.name }] : [],
  );
}
