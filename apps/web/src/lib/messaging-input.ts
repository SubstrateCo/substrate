import { z } from "zod";

const id = z.uuid();
const emails = z.array(z.email().max(320)).max(30);

export const workspaceInput = z.object({ organizationId: z.string().min(1).max(200) });
export const messageListInput = workspaceInput.extend({
  conversationId: id,
  threadId: id.optional(),
});
export const conversationInput = workspaceInput.extend({
  kind: z.enum(["dm", "group", "channel"]),
  name: z.string().trim().min(1).max(80).optional(),
  private: z.boolean().optional(),
  emails: emails.optional(),
});
export const messageInput = messageListInput.extend({ body: z.string().trim().min(1).max(20_000) });
export const reactionInput = workspaceInput.extend({
  messageId: id,
  emoji: z.string().min(1).max(32),
});
export const membersInput = workspaceInput.extend({ conversationId: id, emails });
