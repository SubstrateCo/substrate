import type { ConversationKind } from "@substrate/contracts/messaging/input";

import type { listConversations } from "@/api/messaging/requests";

export type Conversation = Awaited<ReturnType<typeof listConversations>>[number] & {
  unreadCount?: number;
  mentionCount?: number;
};

export type ConversationMember = Omit<
  Conversation["members"][number],
  "agentId" | "external" | "organizationId"
> & {
  agentId?: string | null;
  external?: boolean;
};

export function conversationName(
  conversation: Pick<Conversation, "name" | "kind"> & Partial<Pick<Conversation, "task">>,
): string {
  if (conversation.task) return conversation.task.title;
  return conversation.name || (conversation.kind === "channel" ? "Untitled channel" : "Only you");
}

export type ConversationVisibility = {
  kind: ConversationKind;
  private?: boolean;
};

export function conversationLabel({
  name,
  kind,
  private: locked,
}: ConversationVisibility & { name: string }): string {
  return kind === "channel" && !locked ? `#${name}` : name;
}

export function conversationTextLabel(
  conversation: Pick<Conversation, "name" | "kind" | "private"> &
    Partial<Pick<Conversation, "task">>,
): string {
  return conversationLabel({ ...conversation, name: conversationName(conversation) });
}

export function agentDirectMessage<
  C extends Pick<Conversation, "kind" | "joined"> & { members: readonly ConversationMember[] },
>(conversations: readonly C[], agentId: string) {
  return conversations.find(
    (conversation) =>
      conversation.kind === "agent_dm" &&
      conversation.joined &&
      conversation.members.some((member) => member.type === "agent" && member.agentId === agentId),
  );
}

export function humanMembers(members: readonly ConversationMember[] = []) {
  return members.flatMap((member) =>
    member.type === "human" && member.userId ? [{ userId: member.userId, name: member.name }] : [],
  );
}
