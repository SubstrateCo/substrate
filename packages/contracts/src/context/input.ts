import { createTaskFields } from "../tasks/input.ts";
import { organizationId } from "../workspace.ts";
import { z } from "zod";

export const contextWorkspace = z.object({ organizationId });
export const contextEntity = contextWorkspace.extend({ entityId: z.uuid() });
export const contextMessage = contextWorkspace.extend({ messageId: z.uuid() });
export const contextMessagePage = contextWorkspace.extend({
  messageIds: z.array(z.uuid()).max(50),
});
export const contextTarget = contextMessage.extend({ conversationId: z.uuid() });
export const contextTargets = contextWorkspace.extend({
  targets: z.array(z.object({ conversationId: z.uuid(), messageId: z.uuid() })).max(50),
});
export const contextLink = contextMessage.extend({ entityId: z.uuid() });
export const contextEntityTypes = [
  "task",
  "project",
  "contact",
  "account",
  "deal",
  "contact_interaction",
] as const;
export type ContextEntityType = (typeof contextEntityTypes)[number];
/**
 * Records that context views show as related, such as an interaction's linked records. A calendar
 * event is only a readable target: people cannot link it by hand or reference it from a message.
 */
export const contextTargetTypes = [...contextEntityTypes, "calendar_event"] as const;
export type ContextTargetType = (typeof contextTargetTypes)[number];
export const contextSearchKinds = [
  "all",
  "task",
  "project",
  "contact",
  "account",
  "deal",
  "contact_interaction",
  "message",
  "conversation",
  "person",
  "agent",
  "channel",
  "thread",
] as const;
export type ContextSearchKind = (typeof contextSearchKinds)[number];
// Kinds that one search can combine. Channels and threads have their own order and stay separate.
const contextSearchBatchKind = z.enum(contextSearchKinds).exclude(["all", "channel", "thread"]);
export type ContextSearchBatchKind = z.infer<typeof contextSearchBatchKind>;
export const contextSearch = contextWorkspace
  .extend({
    query: z.string().max(200),
    kind: z.enum(contextSearchKinds).optional(),
    after: z.uuid().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    conversationId: z.uuid().optional(),
    editable: z.boolean().optional(),
    relatedToEntityId: z.uuid().optional(),
    // The first page of each kind, grouped in this order. `limit` applies to each kind.
    kinds: z
      .array(contextSearchBatchKind)
      .min(1)
      .max(contextSearchBatchKind.options.length)
      .refine((kinds) => new Set(kinds).size === kinds.length, "Each kind can appear once.")
      .optional(),
  })
  .refine((input) => !input.kinds || (input.kind === undefined && input.after === undefined), {
    message: "Search several kinds without a kind or a cursor.",
    path: ["kinds"],
  });
export const contextSourceTask = contextMessage.extend({
  requestId: z.uuid(),
  projectEntityId: z.uuid(),
  ...createTaskFields.shape,
});
export const contextNotification = contextWorkspace.extend({ id: z.uuid() });
export const contextNotificationPage = contextWorkspace.extend({
  after: z.uuid().optional(),
  filter: z.enum(["all", "unread"]).default("all"),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});
