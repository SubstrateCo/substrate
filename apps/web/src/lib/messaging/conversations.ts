import type { ConversationKind } from "@substrate/contracts/messaging/input";

import type { listConversations } from "@/api/messaging/requests";

/**
 * A conversation as the server lists it. `joined` marks an active member: public channels the
 * person never joined or left stay readable but leave the sidebar.
 */
export type Conversation = Awaited<ReturnType<typeof listConversations>>[number] & {
  unreadCount?: number;
  /** Unread messages that mention the viewer. */
  mentionCount?: number;
};

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
export function conversationName(
  conversation: Pick<Conversation, "name" | "kind"> & Partial<Pick<Conversation, "task">>,
): string {
  if (conversation.task) return conversation.task.title;
  return conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Only you");
}

export type ConversationVisibility = {
  kind: ConversationKind;
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

/** `conversationLabel` for a conversation record, named as `conversationName` names it. */
export function conversationTextLabel(
  conversation: Pick<Conversation, "name" | "kind" | "private"> &
    Partial<Pick<Conversation, "task">>,
): string {
  return conversationLabel({ ...conversation, name: conversationName(conversation) });
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
