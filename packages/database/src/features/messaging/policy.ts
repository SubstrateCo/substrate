import {
  isDirectConversation,
  messagingLimits,
  type ConversationKind,
} from "@substrate/contracts/messaging/input";

import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";

// Pure messaging rules. Callers load the facts; set-based visibility stays in SQL (access.ts).

export interface Viewer {
  userId: string;
  organizationId: string;
  agent: boolean;
  /** Owner or admin of the viewer's organization, read in this request. */
  admin: boolean;
}

interface ConversationFacts {
  taskEntityId?: string | null;
  kind: ConversationKind;
  /** The host organization. */
  organizationId: string;
  createdBy: string;
}

export function viewerOf(
  scope: { userId: string; organizationId: string; actorEntityId?: string },
  admin: boolean,
): Viewer {
  return {
    userId: scope.userId,
    organizationId: scope.organizationId,
    agent: !!scope.actorEntityId,
    admin,
  };
}

export const hosts = (conversation: ConversationFacts, viewer: Viewer) =>
  conversation.organizationId === viewer.organizationId;

/** A legacy external creator does not own the host organization's conversation. */
const owns = (conversation: ConversationFacts, viewer: Viewer) =>
  !viewer.agent && hosts(conversation, viewer) && conversation.createdBy === viewer.userId;

/**
 * Owners manage their conversation. Host admins manage any of its conversations except DMs,
 * without gaining read access. Agents never manage.
 */
export const canManage = (conversation: ConversationFacts, viewer: Viewer) =>
  !conversation.taskEntityId &&
  !viewer.agent &&
  !isDirectConversation(conversation.kind) &&
  (owns(conversation, viewer) || (viewer.admin && hosts(conversation, viewer)));

/**
 * Host side: channels need an admin, groups their owner or an admin, and DMs their owner.
 * Partner side, with an active connection: an admin for channels and groups, or a DM the
 * viewer can see.
 */
export function canShare(
  conversation: ConversationFacts,
  viewer: Viewer,
  partner: { connected: boolean; visible: boolean },
) {
  if (viewer.agent || conversation.taskEntityId || conversation.kind === "agent_dm") return false;
  if (hosts(conversation, viewer)) {
    if (conversation.kind === "channel") return viewer.admin;
    return owns(conversation, viewer) || (viewer.admin && conversation.kind !== "dm");
  }
  if (!partner.connected) return false;
  return conversation.kind === "dm" ? partner.visible : viewer.admin;
}

/** Host channel invitations need a partner admin's approval. Others are individual consent. */
export function invitationTarget(conversation: ConversationFacts, viewer: Viewer) {
  const host = hosts(conversation, viewer);
  return {
    purpose:
      conversation.kind === "channel" && host ? ("organization" as const) : ("person" as const),
    targetOrganizationId: host ? null : viewer.organizationId,
  };
}

/** The host manages every partner. A partner manages only itself. */
export const partnerTargetAllowed = (
  conversation: ConversationFacts,
  viewer: Viewer,
  targetOrganizationId: string,
) =>
  targetOrganizationId !== conversation.organizationId &&
  (hosts(conversation, viewer) || targetOrganizationId === viewer.organizationId);

export function validateExternalInvitations(
  conversation: Pick<ConversationFacts, "kind">,
  viewer: Viewer,
  invitations: { count: number; shareHistory: boolean },
) {
  if (!invitations.count) return;
  if (conversation.kind === "agent_dm") throw new AccessDeniedError();
  if (conversation.kind === "channel" && !viewer.admin)
    throw new ValidationError(
      "Only organization owners and admins can invite partner organizations to channels.",
    );
  if (!invitations.shareHistory)
    throw new ValidationError(
      "Confirm that invited people can read the full conversation history.",
    );
}

/** Returns the stored name and private flag of a new conversation. */
export function validateCreate(
  input: { kind: ConversationKind; name?: string; private?: boolean },
  recipients: number,
) {
  if (isDirectConversation(input.kind) && recipients !== 1)
    throw new ValidationError("A DM requires exactly one recipient.");
  if (input.kind === "group" && recipients < 2)
    throw new ValidationError("A group DM requires at least two recipients.");
  const name = input.name?.trim() || null;
  if (input.kind === "channel" && !name) throw new ValidationError("Channels require a name.");
  return { name, private: input.kind === "channel" ? (input.private ?? false) : true };
}

/**
 * Anyone but a DM member may leave. The owner leaves only by naming a new owner, who must be
 * checked as a current member.
 */
export function leavePlan(
  conversation: ConversationFacts,
  viewer: Viewer,
  newOwnerUserId?: string,
): "leave" | "transfer" | "blocked" {
  // Agents only read and post.
  if (viewer.agent || isDirectConversation(conversation.kind) || conversation.taskEntityId)
    throw new AccessDeniedError();
  if (!owns(conversation, viewer)) return "leave";
  return newOwnerUserId && newOwnerUserId !== viewer.userId ? "transfer" : "blocked";
}

export const leaveBlocked = (otherPeople: boolean) =>
  new ConflictError(
    otherPeople
      ? "Choose a new owner before leaving."
      : "You are the last member. Delete the conversation instead.",
  );

export function validateBody(body: string, attachmentCount = 0) {
  if ((!body.trim() && !attachmentCount) || body.length > messagingLimits.body)
    throw new ValidationError(`Message must contain 1 to ${messagingLimits.body} characters.`);
}

export function validateEmoji(emoji: string) {
  if (!emoji.trim() || emoji.length > messagingLimits.emoji)
    throw new ValidationError(`Reaction must contain 1 to ${messagingLimits.emoji} characters.`);
}
