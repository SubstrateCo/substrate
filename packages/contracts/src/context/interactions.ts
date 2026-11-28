import { utcTimestamp } from "../timestamps.ts";
import { organizationId } from "../workspace.ts";
import { z } from "zod";

const workspace = z.object({ organizationId });
export const interactionRecord = workspace.extend({ entityId: z.uuid() });
export const contactInteractionList = workspace.extend({ contactEntityId: z.uuid() });
export const interactionFields = z.object({
  contactEntityId: z.uuid(),
  kind: z.enum(["email", "meeting", "call", "message", "note", "other"]),
  occurredAt: utcTimestamp,
  endedAt: utcTimestamp.nullable().optional(),
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
  interactionRecord.extend({
    action: z.literal("updateInteraction"),
    summary: z.string().trim().min(1).max(10000),
  }),
  interactionRecord.extend({ action: z.literal("deleteInteraction") }),
]);
export type InteractionWrite = z.output<typeof interactionWrite>;

export const interactionPeriod = workspace
  .extend({
    from: utcTimestamp,
    until: utcTimestamp,
    timeZone: z
      .string()
      .max(100)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }),
    /** Only interactions the signed-in actor logged. The server derives the actor. */
    loggedBy: z.literal("me").optional(),
  })
  .refine(({ from, until }) => {
    const duration = Date.parse(until) - Date.parse(from);
    return duration > 0 && duration <= 32 * 86_400_000;
  }, "Choose a period of at most 32 days.");
export const interactionTimeline = interactionPeriod
  .safeExtend({
    contactEntityId: z.uuid().optional(),
    accountEntityId: z.uuid().optional(),
    scope: z.enum(["related", "linked"]).optional(),
    allTime: z.literal("true").optional(),
    kind: interactionFields.shape.kind.optional(),
    origin: z.enum(["manual", "message_publication", "calendar_event"]).optional(),
    search: z.string().trim().max(200).optional(),
    beforeOccurredAt: utcTimestamp.optional(),
    beforeEntityId: z.uuid().optional(),
  })
  .refine(
    (input) => !!input.beforeOccurredAt === !!input.beforeEntityId,
    "Both cursor fields are required.",
  );
export type InteractionPeriod = z.output<typeof interactionPeriod>;
export type InteractionTimeline = z.output<typeof interactionTimeline>;
export const interactionProfile = interactionRecord.extend({ type: z.enum(["person", "account"]) });
export const interactionDirectory = interactionPeriod.safeExtend({
  type: z.enum(["people", "accounts"]),
  search: z.string().trim().max(200).optional(),
  repeat: z.literal("true").optional(),
  allTime: z.literal("true").optional(),
  sort: z.enum(["latest", "name", "count"]).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type InteractionDirectory = z.output<typeof interactionDirectory>;
