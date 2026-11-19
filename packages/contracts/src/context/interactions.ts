import { organizationId } from "../workspace.ts";
import { z } from "zod";

const workspace = z.object({ organizationId });
const record = workspace.extend({ entityId: z.uuid() });
export const contactInteractionList = workspace.extend({ contactEntityId: z.uuid() });
export const interactionFields = z.object({
  contactEntityId: z.uuid(),
  kind: z.enum(["email", "meeting", "call", "message", "note", "other"]),
  occurredAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable().optional(),
  summary: z.string().trim().min(1).max(10000),
});
export type InteractionKind = z.output<typeof interactionFields>["kind"];
export const interactionWrite = z.discriminatedUnion("action", [
  workspace.extend({ action: z.literal("createInteraction"), ...interactionFields.shape }),
  workspace.extend({
    action: z.literal("publishInteraction"),
    ...interactionFields.shape,
    messageId: z.uuid(),
    consentToContactAudience: z.literal(true),
  }),
  record.extend({
    action: z.literal("updateInteraction"),
    summary: z.string().trim().min(1).max(10000),
  }),
  record.extend({ action: z.literal("deleteInteraction") }),
]);
export type InteractionWrite = z.output<typeof interactionWrite>;
