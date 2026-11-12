import { organizationId } from "../workspace.js";
import { accountFields, contactFields, dealFields } from "./input.js";
import { z } from "zod";

const source = z.object({
  organizationId,
  messageId: z.uuid(),
  requestId: z.uuid(),
  consentToRecordAudience: z.literal(true),
  associate: z.boolean().default(false),
});

export const crmFromMessage = z.discriminatedUnion("kind", [
  source.extend({ kind: z.literal("account"), fields: accountFields.strict() }).strict(),
  source.extend({ kind: z.literal("contact"), fields: contactFields.strict() }).strict(),
  source.extend({ kind: z.literal("deal"), fields: dealFields.strict() }).strict(),
]);
export type CrmFromMessage = z.output<typeof crmFromMessage>;
export type CrmFromMessageInput = z.input<typeof crmFromMessage>;

export interface CrmFromMessageResult {
  entityId: string;
  entityType: "account" | "contact" | "deal";
}
