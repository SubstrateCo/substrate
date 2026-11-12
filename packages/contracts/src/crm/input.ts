import { taskStatusValues, taskPriorityValues } from "../tasks/status.js";
import { organizationId } from "../workspace.js";
import { crmReportFilters } from "./report-input.js";
import { z } from "zod";

export const crmWorkspace = z.object({ organizationId });
export const crmList = crmWorkspace.extend({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  afterEntityId: z.uuid().optional(),
  search: z.string().trim().max(200).optional(),
  archived: z.enum(["active", "archived", "all"]).default("active"),
});
export const crmRecord = crmWorkspace.extend({ entityId: z.uuid() });
export const crmContact = crmWorkspace.extend({ contactEntityId: z.uuid() });
export const crmTimeline = crmRecord
  .extend({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    beforeOccurredAt: z.iso.datetime().optional(),
    beforeEntityId: z.uuid().optional(),
    mode: z.enum(["participants", "linked"]).default("participants"),
  })
  .refine(
    (value) => Boolean(value.beforeOccurredAt) === Boolean(value.beforeEntityId),
    "Supply both timeline cursor fields.",
  );
export const crmIdentifierSearch = crmWorkspace.extend({
  type: z.enum(["email", "phone"]),
  value: z.string().trim().min(1).max(1000),
  countryCode: z.string().length(2).optional(),
});
export const crmReport = crmWorkspace.extend({
  ...crmReportFilters.shape,
  from: z.iso.datetime(),
  to: z.iso.datetime(),
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
export const contactFields = z.object({
  displayName: z.string().trim().min(1).max(1000),
  givenName: z.string().trim().min(1).max(1000).nullable().optional(),
  familyName: z.string().trim().min(1).max(1000).nullable().optional(),
  notes: z.string().max(50000).nullable().optional(),
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
export const interactionFields = z.object({
  contactEntityId: z.uuid(),
  kind: z.enum(["email", "meeting", "call", "message", "note", "other"]),
  occurredAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable().optional(),
  summary: z.string().trim().min(1).max(10000),
});
const detailFields = {
  label: z.string().trim().min(1).max(1000).nullable().optional(),
  isPrimary: z.boolean().optional(),
};
export const contactIdentifierFields = z.object({
  ...detailFields,
  type: z.enum(["email", "phone"]),
  value: z.string().trim().min(1).max(1000),
  extension: z
    .string()
    .regex(/^[0-9]+$/)
    .max(20)
    .nullable()
    .optional(),
  countryCode: z.string().length(2).optional(),
});
const addressText = z.string().trim().min(1).max(1000).nullable().optional();
export const contactAddressFields = z.object({
  ...detailFields,
  streetAddress: addressText,
  extendedAddress: addressText,
  city: addressText,
  region: addressText,
  postalCode: addressText,
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  formattedAddress: addressText,
});
export const contactUrlFields = z.object({
  ...detailFields,
  url: z.url({ protocol: /^https?$/ }).max(4000),
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
  crmWorkspace.extend({ action: z.literal("createContact"), ...contactFields.shape }),
  crmRecord.extend({ action: z.literal("updateContact"), ...contactFields.partial().shape }),
  crmContact.extend({ action: z.literal("addIdentifier"), ...contactIdentifierFields.shape }),
  crmContact.extend({
    action: z.literal("updateIdentifier"),
    id: z.uuid(),
    ...contactIdentifierFields.shape,
  }),
  crmContact.extend({ action: z.literal("removeIdentifier"), id: z.uuid() }),
  crmContact.extend({ action: z.literal("addAddress"), ...contactAddressFields.shape }),
  crmContact.extend({
    action: z.literal("updateAddress"),
    id: z.uuid(),
    ...contactAddressFields.shape,
  }),
  crmContact.extend({ action: z.literal("removeAddress"), id: z.uuid() }),
  crmContact.extend({ action: z.literal("addUrl"), ...contactUrlFields.shape }),
  crmContact.extend({ action: z.literal("updateUrl"), id: z.uuid(), ...contactUrlFields.shape }),
  crmContact.extend({ action: z.literal("removeUrl"), id: z.uuid() }),
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
    title: z.string().trim().min(1).max(300),
    description: z.string().max(20000).optional(),
    status: z.enum(taskStatusValues).optional(),
    priority: z.enum(taskPriorityValues).optional(),
    assigneeActorEntityId: z.uuid().nullable().optional(),
    dueDate: z.iso.date().nullable().optional(),
    consentToTaskAudience: z.literal(true),
  }),
  crmContact.extend({
    action: z.literal("setAffiliation"),
    accountEntityId: z.uuid(),
    title: z.string().max(300).default(""),
    isPrimary: z.boolean().default(false),
  }),
  crmContact.extend({ action: z.literal("removeAffiliation"), accountEntityId: z.uuid() }),
  crmWorkspace.extend({ action: z.literal("createInteraction"), ...interactionFields.shape }),
  crmWorkspace.extend({
    action: z.literal("publishInteraction"),
    ...interactionFields.shape,
    messageId: z.uuid(),
    consentToContactAudience: z.literal(true),
  }),
  crmRecord.extend({
    action: z.literal("updateInteraction"),
    summary: z.string().trim().min(1).max(10000),
  }),
  crmRecord.extend({ action: z.literal("deleteInteraction") }),
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
    level: z.enum(["view", "comment", "edit", "owner"]),
  }),
]);
export type CrmWrite = z.output<typeof crmWrite>;
