import type { ConversationKind } from "./input";

// What the viewer may do in a conversation, from the server's `canManage` and the facts the
// conversation list returns. `canManage` already excludes DMs, task discussions, and agents.

type ConversationFacts = {
  kind: ConversationKind;
  organizationId: string;
  createdBy: string;
  joined?: boolean;
  canManage?: boolean;
  task?: unknown;
};

type MemberFacts = {
  type: "human" | "agent";
  userId?: string | null;
  organizationId: string;
  /** The server sets this only for the viewer's own agents. */
  agentId?: string | null;
};

/** A member leaves anywhere but a DM or a task discussion. */
export function canLeave(conversation: ConversationFacts) {
  return !!conversation.joined && conversation.kind !== "dm" && !conversation.task;
}

/** A member adds and removes their own agents wherever they may leave. */
export function canManageOwnAgents(conversation: ConversationFacts) {
  return canLeave(conversation);
}

/** Managers remove people of the host organization, never themselves or the owner. */
export function canRemovePerson(
  conversation: ConversationFacts,
  viewerId: string,
  member: MemberFacts,
) {
  return (
    !!conversation.canManage &&
    member.type === "human" &&
    member.organizationId === conversation.organizationId &&
    member.userId !== viewerId &&
    member.userId !== conversation.createdBy
  );
}

/** Any member removes their own agent. No one removes another person's agent. */
export function canRemoveMember(
  conversation: ConversationFacts,
  viewerId: string,
  member: MemberFacts,
) {
  if (member.type === "agent") return !!member.agentId && canManageOwnAgents(conversation);
  return canRemovePerson(conversation, viewerId, member);
}
