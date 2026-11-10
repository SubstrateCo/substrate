import { attachmentFileIds } from "../files/attachments";
import { organizationId } from "../workspace";
import { z } from "zod";

/** Input limits. The server validates them here, and the database service applies the same. */
export const messagingLimits = { recipients: 30, agents: 20, body: 20_000, emoji: 64 } as const;

const id = z.uuid();
const emails = z.array(z.email().max(320)).max(messagingLimits.recipients);

export const workspaceInput = z.object({ organizationId });
export const messageListInput = workspaceInput.extend({
  conversationId: id,
  threadId: id.optional(),
  beforeMessageId: id.optional(),
  aroundMessageId: id.optional(),
});
export const conversationInput = workspaceInput.extend({
  kind: z.enum(["dm", "group", "channel"]),
  name: z.string().trim().min(1).max(80).optional(),
  private: z.boolean().optional(),
  emails: emails.optional(),
  shareHistory: z.boolean().optional(),
  /** Agent definition IDs owned by the caller. */
  agentIds: z.array(id).max(messagingLimits.agents).optional(),
});
export const messageInput = messageListInput
  .extend({
    body: z.string().trim().max(messagingLimits.body),
    attachmentFileIds: attachmentFileIds.optional(),
    requestId: z.uuid().optional(),
  })
  .refine((input) => !!input.body || !!input.attachmentFileIds?.length, "Add text or a file.");
export const reactionInput = workspaceInput.extend({
  messageId: id,
  emoji: z.string().min(1).max(messagingLimits.emoji),
});
export const reactionListInput = workspaceInput.extend({
  messageId: id,
  emoji: z.string().min(1).max(messagingLimits.emoji).optional(),
  afterActorId: id.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(3),
});
export const profileInput = workspaceInput.extend({
  conversationId: id,
  actorId: id,
});
export const membersInput = workspaceInput.extend({
  conversationId: id,
  emails: emails.default([]),
  shareHistory: z.boolean().optional(),
});
export const conversationTargetInput = workspaceInput.extend({ conversationId: id });
export const addAgentInput = conversationTargetInput.extend({ agentId: id });
export const removeAgentInput = conversationTargetInput.extend({ actorId: id });
export const leaveInput = conversationTargetInput.extend({
  newOwnerUserId: z.string().min(1).max(200).optional(),
});
export const ownerInput = conversationTargetInput.extend({
  userId: z.string().min(1).max(200),
});
