import type { listConversations } from "@/api/messaging/requests";

/**
 * A conversation as the server lists it. `joined` marks an active member: public channels the
 * person never joined or left stay readable but leave the sidebar.
 */
export type Conversation = Awaited<ReturnType<typeof listConversations>>[number];

/**
 * `agentId` names the agent definition only for the viewer's own agents. `external` marks members
 * from another organization. Admin lists omit both.
 */
export type ConversationMember = Omit<
  Conversation["members"][number],
  "agentId" | "external" | "organizationId"
> & {
  agentId?: string | null;
  external?: boolean;
};

// The server names unnamed DMs and groups after their other members. With none yet, such as while
// an invitation waits, only the viewer is in it.
export function conversationName(conversation: Pick<Conversation, "name" | "kind">): string {
  return conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Only you");
}

export type ConversationVisibility = {
  kind: "dm" | "group" | "channel";
  /** Private channels, DMs, and groups are private. Only a public channel has a "#" name. */
  private?: boolean;
};

/**
 * A conversation's name in running text with no icon beside it ("Message #launch"). Only a public
 * channel gets the "#"; a private channel, DM, or group reads as its bare name. Where the kind
 * icon shows (`ConversationKindIcon`), use the bare name.
 */
export function conversationLabel({
  name,
  kind,
  private: locked,
}: ConversationVisibility & { name: string }): string {
  return kind === "channel" && !locked ? `#${name}` : name;
}

/**
 * Joins the viewer's enabled agents with their agent members here, by agent definition ID.
 * Members that match no enabled agent stay removable.
 */
export function conversationAgentOptions(
  agents: readonly { id: string; name: string; image?: string | null; enabled: boolean }[],
  members: readonly { id: string; title: string; image?: string | null; agentId?: string }[],
): { agentId: string; name: string; image?: string | null; actorId?: string }[] {
  const matched = new Set<string>();
  const options = agents.flatMap((agent) => {
    if (!agent.enabled) return [];
    const member = members.find((entry) => entry.agentId === agent.id);
    if (member) matched.add(member.id);
    return [{ agentId: agent.id, name: agent.name, image: agent.image, actorId: member?.id }];
  });
  return [
    ...options,
    ...members.flatMap((member) =>
      matched.has(member.id)
        ? []
        : [
            {
              agentId: member.agentId ?? member.id,
              name: member.title,
              image: member.image,
              actorId: member.id,
            },
          ],
    ),
  ];
}

/** The viewer's open DM with their agent, so a new message reuses it. */
export function agentDirectMessage<
  C extends Pick<Conversation, "kind" | "joined"> & { members: readonly ConversationMember[] },
>(conversations: readonly C[], agentId: string) {
  return conversations.find(
    (conversation) =>
      conversation.kind === "dm" &&
      conversation.joined &&
      conversation.members.some((member) => member.type === "agent" && member.agentId === agentId),
  );
}

// Only people can own, leave, or receive a conversation. Agents are members without a user.
export function humanMembers(members: readonly ConversationMember[] = []) {
  return members.flatMap((member) =>
    member.type === "human" && member.userId ? [{ userId: member.userId, name: member.name }] : [],
  );
}
