import { z } from "zod";

const id = z.string().min(1).max(200);
const emails = z.array(z.email().max(320)).max(30);

export const messagingWorkspace = z.object({ organizationId: id });

export const messagingRead = z.discriminatedUnion("action", [
  z.object({ action: z.literal("conversations") }),
  z.object({
    action: z.literal("messages"),
    conversationId: id,
    threadId: id.optional(),
    beforeMessageId: z.uuid().optional(),
    aroundMessageId: z.uuid().optional(),
  }),
]);

export const messagingWrite = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    kind: z.enum(["dm", "group", "channel"]),
    name: z.string().trim().min(1).max(80).optional(),
    private: z.boolean().optional(),
    emails: emails.optional(),
  }),
  z.object({
    action: z.literal("send"),
    conversationId: id,
    body: z.string().trim().min(1).max(20_000),
    threadId: id.optional(),
    requestId: z.uuid().optional(),
  }),
  z.object({ action: z.literal("react"), messageId: id, emoji: z.string().min(1).max(32) }),
  z.object({ action: z.literal("addMembers"), conversationId: id, emails }),
]);
