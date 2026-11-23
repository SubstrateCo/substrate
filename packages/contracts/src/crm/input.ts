import { createTaskFields } from "../tasks/input.ts";
import { permissionLevels } from "../tasks/status.ts";
import { utcTimestamp } from "../timestamps.ts";
import { organizationId, recordListFields } from "../workspace.ts";
import { crmReportFilters } from "./report-input.ts";
import { z } from "zod";

export const crmWorkspace = z.object({ organizationId });
export const crmHome = crmWorkspace.extend({ today: z.iso.date() });
export const crmList = crmWorkspace.extend(recordListFields);
export type RecordArchiveFilter = z.output<typeof crmList>["archived"];
export const crmRecord = crmWorkspace.extend({ entityId: z.uuid() });
export const crmContact = crmWorkspace.extend({ contactEntityId: z.uuid() });
export const crmTimeline = crmRecord
  .extend({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    beforeOccurredAt: utcTimestamp.optional(),
    beforeEntityId: z.uuid().optional(),
    mode: z.enum(["participants", "linked"]).default("participants"),
  })
  .refine(
    (value) => Boolean(value.beforeOccurredAt) === Boolean(value.beforeEntityId),
    "Supply both timeline cursor fields.",
  );
export type CrmTimelineMode = z.output<typeof crmTimeline>["mode"];
export const crmReport = crmWorkspace.extend({
  ...crmReportFilters.shape,
  from: utcTimestamp,
  to: utcTimestamp,
});
export const accountFields = z.object({
  name: z.string().trim().min(1).max(300),
  website: z
    .url({ protocol: /^https?$/ })
    .max(4000)
    .nullable()
    .default(null),
  domain: z.string().trim().max(253).nullable().default(null),
  summary: z.string().max(20000).default(""),
});
export const dealFields = z.object({
  title: z.string().trim().min(1).max(300),
  accountEntityId: z.uuid().nullable().default(null),
  contactEntityIds: z.array(z.uuid()).max(100).default([]),
  primaryContactEntityId: z.uuid().nullable().default(null),
  stageId: z.uuid(),
  amount: z
    .string()
    .regex(/^\d{1,15}(\.\d{1,4})?$/)
    .nullable()
    .default(null),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .default(null),
  expectedCloseDate: z.iso.date().nullable().default(null),
  summary: z.string().max(20000).default(""),
});
export const crmWrite = z.discriminatedUnion("action", [
  crmRecord.extend({ action: z.literal("revoke"), actorEntityId: z.uuid() }),
  crmWorkspace.extend({
    action: z.literal("updateSettings"),
    defaultCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
  }),
  crmWorkspace.extend({
    action: z.literal("createAccount"),
    requestId: z.uuid().optional(),
    ...accountFields.shape,
  }),
  crmRecord.extend({ action: z.literal("updateAccount"), ...accountFields.shape }),
  crmWorkspace.extend({
    action: z.literal("createDeal"),
    requestId: z.uuid().optional(),
    ...dealFields.shape,
  }),
  crmRecord.extend({
    action: z.literal("assignOwner"),
    ownerActorEntityId: z.uuid(),
    expectedOwnerActorEntityId: z.uuid(),
    expectedVersion: z.number().int().min(1).optional(),
    accessDecision: z.enum(["require_existing_access", "keep_restricted"]),
  }),
  crmRecord.extend({
    action: z.literal("updateDeal"),
    expectedVersion: z.number().int().min(1),
    ...dealFields.shape,
  }),
  crmRecord.extend({
    action: z.literal("transitionDeal"),
    expectedVersion: z.number().int().min(1),
    requestId: z.uuid(),
    stageId: z.uuid(),
    outcome: z.enum(["open", "won", "lost"]),
    lostReason: z.string().max(2000).nullable().default(null),
  }),
  crmRecord.extend({ action: z.literal("archive"), archived: z.boolean() }),
  crmRecord.extend({
    action: z.literal("createFollowUp"),
    requestId: z.uuid(),
    projectEntityId: z.uuid(),
    ...createTaskFields.shape,
    consentToTaskAudience: z.literal(true),
  }),
  crmContact.extend({
    action: z.literal("setAffiliation"),
    accountEntityId: z.uuid(),
    title: z.string().max(300).default(""),
    isPrimary: z.boolean().default(false),
  }),
  crmContact.extend({ action: z.literal("removeAffiliation"), accountEntityId: z.uuid() }),
  crmWorkspace.extend({
    action: z.literal("configureStages"),
    stages: z
      .array(z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(100) }))
      .min(1)
      .max(20),
  }),
  crmRecord.extend({
    action: z.literal("share"),
    actorEntityId: z.uuid(),
    level: z.enum(permissionLevels),
  }),
]);
export type CrmWrite = z.output<typeof crmWrite>;
export type DealOutcome = Extract<CrmWrite, { action: "transitionDeal" }>["outcome"];
