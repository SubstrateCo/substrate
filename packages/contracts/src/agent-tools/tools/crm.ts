import { contactIdentifierSearch, contactWrite } from "../../contacts/input.ts";
import { interactionFields, interactionWrite } from "../../context/interactions.ts";
import {
  crmActivityActions,
  crmActivityFields,
  crmActivityOptions,
  crmActivityCursor,
} from "../../crm/activity.ts";
import { crmList, crmWrite } from "../../crm/input.ts";
import { recordLinks } from "./links.ts";
import { id, requestId, timestamp } from "./shared.ts";
import { taskResult } from "./tasks.ts";
import { z } from "zod";

const kind = z.enum(["account", "contact", "deal"]);
export const contactDetailActions = [
  "addIdentifier",
  "updateIdentifier",
  "removeIdentifier",
  "addAddress",
  "updateAddress",
  "removeAddress",
  "addUrl",
  "updateUrl",
  "removeUrl",
] as const;
const detailText = z.string().trim().min(1).max(1000).nullable().optional();
const record = z.record(z.string(), z.json());
const recordResult = z.object({ record: z.object({ entityId: id }).catchall(z.json()) });
const interactionCursor = z.object({ occurredAt: timestamp, entityId: id }).strict();
const mutationSchemas = [...crmWrite.options, ...contactWrite.options, ...interactionWrite.options];
type MutationSchemas = {
  [S in (typeof mutationSchemas)[number] as S["shape"]["action"]["value"]]: S;
};
// SAFETY: each union member is keyed by its own literal discriminator.
const mutations = Object.fromEntries(
  mutationSchemas.map((schema) => [schema.shape.action.value, schema]),
) as MutationSchemas;
const contactResult = z.object({
  record: record.describe("The contact as get_crm_record returns it."),
});
const interactionItems = z.object({
  items: z.array(record),
  nextBefore: interactionCursor
    .nullable()
    .describe("Continuation when more interactions follow; null on the last page."),
});

export const crmTools = {
  create_crm_from_message: {
    title: "Create CRM record from a message",
    description:
      "Create a confirmed new account, contact or deal from a readable same-organization message, preserving structured provenance. Search for existing records first. Your owner must approve the fields and the record-reader audience before you set consentToRecordAudience; a request from your owner in this turn to create this record from this message is that approval. associate additionally links the discussion without widening access. Returns the current public record projection. Interactive turns only; no outreach or agent wakes.",
    readOnly: false,
    idempotent: true,
    // One flat object: some MCP clients show no fields for a tool whose input is a union. The
    // server checks fields against the kind with crmFromMessage.
    input: z
      .object({
        kind,
        messageId: id,
        requestId,
        consentToRecordAudience: z.literal(true),
        associate: z.boolean().default(false).describe("Also link the discussion to the record."),
        fields: z
          .record(z.string(), z.json())
          .describe(
            "The new record, with the fields of the matching create tool. account: name, website, domain, summary. contact: displayName, givenName, familyName, notes, email, phone, phoneCountryCode, accountEntityId, title. deal: title, stageId, accountEntityId, contactEntityIds, primaryContactEntityId, amount, currency, expectedCloseDate, summary.",
          ),
      })
      .strict(),
    output: z.object({ entityId: id, entityType: kind, record }),
  },
  list_crm_activity: {
    title: "Read shared CRM activity",
    description:
      "Read permitted internal account, contact or deal changes by people and agents. This is not customer-contact history. Agent attribution uses a safe label, not private agent names or IDs. Pass nextCursor as before to continue.",
    readOnly: true,
    input: crmActivityOptions.extend({ entityId: id }).strict(),
    output: z.object({
      items: z.array(
        z
          .object({
            id,
            entityId: id,
            action: z.enum(crmActivityActions),
            changedFields: z.array(z.enum(crmActivityFields)),
            createdAt: timestamp,
            actor: z.object({ type: z.enum(["human", "agent"]), displayName: z.string() }).strict(),
            relatedEntityId: id.optional(),
          })
          .strict(),
      ),
      nextCursor: crmActivityCursor.nullable(),
    }),
  },
  get_crm_settings: {
    title: "Read organization CRM defaults",
    description:
      "Read this organization's CRM defaults without initializing or changing settings. defaultCurrency null means unset, not USD. Use a configured currency only for a new deal without an explicit override; never default an amount or close date or convert existing deals.",
    readOnly: true,
    input: z.object({}).strict(),
    output: z.object({
      settings: z
        .object({
          defaultCurrency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .nullable(),
        })
        .catchall(z.json()),
    }),
  },
  update_crm_settings: {
    title: "Update organization CRM defaults",
    description:
      "Set or clear the organization's default currency. Requires the authenticated owner's current organization-admin capability and an interactive request. Does not change any existing deal, amount or close date. Do not change defaults merely to complete one deal.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.updateSettings
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: z.object({
      settings: z
        .object({
          defaultCurrency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .nullable(),
        })
        .catchall(z.json()),
    }),
  },
  create_crm_follow_up: {
    publishes: [{ kind: "task", id: "id" }],
    title: "Create connected CRM follow-up",
    description:
      "Create an existing-domain task from an editable CRM record, preserving structured source and contextual links. Requires an accessible project and your owner's approval of the task text for that project's readers; a request from your owner in this turn for this follow-up is that approval. dueDate is YYYY-MM-DD, not a time or reminder. Set consentToTaskAudience only with that approval. Interactive turns only; no email or calendar invite.",
    readOnly: false,
    idempotent: true,
    input: mutations.createFollowUp.omit({ organizationId: true, action: true }).strict(),
    output: taskResult,
  },
  list_crm_records: {
    title: "List and search CRM records",
    description:
      "List or search readable customer accounts, contacts and deals. Leave kind out to search all three at once: use that to find a customer by name, or to check that nothing exists before you create records. Each item then says its kind. Deals include their stage name. A name or domain match is not identity proof. Paging needs a kind: pass nextAfterEntityId as afterEntityId with the same kind, search and archived.",
    readOnly: true,
    input: crmList
      .omit({ organizationId: true })
      .extend({
        kind: kind
          .optional()
          .describe("Omit to search accounts, contacts and deals in one call, one page of each."),
      })
      .strict(),
    output: z.object({ items: z.array(record), nextAfterEntityId: id.nullable() }),
  },
  get_crm_record: {
    title: "Read CRM record",
    description:
      "Read an account, contact or deal, its permitted related records, and its newest linked messages and records. A deal includes its stage name. The CRM can be behind team chat: for a status or a briefing, also search messages for the customer with search_content. Read the deal version before updates or transitions. Relationships never grant access to another record.",
    readOnly: true,
    input: z.object({ kind, entityId: id }).strict(),
    output: z.object({ record, linked: recordLinks }),
  },
  get_crm_pipeline: {
    title: "Read CRM pipeline",
    description:
      "Read the current pipeline's stable stage IDs. Outcomes open, won and lost are separate from stage labels.",
    readOnly: true,
    input: z.object({}).strict(),
    output: z.object({ stages: z.array(record) }),
  },
  create_crm_account: {
    title: "Create CRM account",
    description:
      "Create a customer business, not a workspace organization. Search existing accounts first. Interactive turns only. Does not publish a message, notify or wake an agent.",
    readOnly: false,
    idempotent: true,
    input: mutations.createAccount
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: recordResult,
  },
  update_crm_account: {
    title: "Update CRM account",
    description:
      "Change only the account fields you supply; the others stay as they are. Interactive turns only; does not grant access or send outreach.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: z
      .object({
        requestId,
        entityId: id,
        name: z.string().trim().min(1).max(300).optional(),
        website: z
          .url({ protocol: /^https?$/ })
          .max(4000)
          .nullable()
          .optional(),
        domain: z.string().trim().max(253).nullable().optional(),
        summary: z.string().max(20000).optional(),
      })
      .strict(),
    output: recordResult,
  },
  create_crm_contact: {
    title: "Create CRM contact",
    description:
      "Create a canonical customer contact, not a user or messaging actor. In the same call you can add a stated email and phone and link the contact to an account with a job title; later changes use change_crm_contact_detail and set_crm_affiliation. Search for readable candidates first; never invent contact details or merge on a name match. Interactive turns only.",
    readOnly: false,
    idempotent: true,
    input: mutations.createContact
      .omit({ organizationId: true, action: true })
      .extend({
        requestId,
        email: z.email().max(320).optional().describe("The contact's primary email address."),
        phone: z.string().trim().min(1).max(100).optional().describe("The primary phone number."),
        phoneCountryCode: z
          .string()
          .length(2)
          .optional()
          .describe("Two-letter country, for a phone number without a country prefix."),
        accountEntityId: id.optional().describe("The account the contact works at."),
        title: z.string().max(300).optional().describe("Job title at that account."),
      })
      .strict(),
    output: recordResult,
  },
  update_crm_contact: {
    title: "Update CRM contact",
    description:
      "Change only supplied contact fields. Read first; notes replace the existing notes. Interactive turns only.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.updateContact
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: recordResult,
  },
  create_crm_deal: {
    title: "Create CRM deal",
    description:
      "Create a specific sales pursuit with an account or participant contact. Read the pipeline for stageId. Call get_crm_settings only when you have an amount without a currency. Explicit currency overrides win; null default means unset, never assume USD. Keep unknown amounts and dates null; amount and currency must be supplied together. Interactive turns only.",
    readOnly: false,
    idempotent: true,
    input: mutations.createDeal
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: recordResult,
  },
  update_crm_deal: {
    title: "Update CRM deal",
    description:
      "Change only the deal fields you supply; the others stay as they are. contactEntityIds, when supplied, is the whole new list of contacts. Needs the expectedVersion from a deal read or list. On conflict read again; do not overwrite blindly. Use transition_crm_deal for the stage and for outcomes. Interactive turns only.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: z
      .object({
        requestId,
        entityId: id,
        expectedVersion: z.number().int().min(1),
        title: z.string().trim().min(1).max(300).optional(),
        accountEntityId: id.nullable().optional(),
        contactEntityIds: z
          .array(id)
          .max(100)
          .optional()
          .describe("Replaces all contacts of the deal. Omit to keep them."),
        primaryContactEntityId: id.nullable().optional(),
        amount: z
          .string()
          .regex(/^\d{1,15}(\.\d{1,4})?$/)
          .nullable()
          .optional()
          .describe("A decimal number as text, such as 78000. Null for unknown."),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .nullable()
          .optional(),
        expectedCloseDate: z.iso.date().nullable().optional(),
        summary: z.string().max(20000).optional(),
      })
      .strict(),
    output: recordResult,
  },
  transition_crm_deal: {
    title: "Change CRM deal stage or outcome",
    description:
      "Move a deal, close it won/lost, or explicitly reopen it with outcome open. Use the expectedVersion from a deal read or list. Leave stageId out to keep the current stage, as when you only mark a deal won or lost; set it from get_crm_pipeline to move the deal. On conflict reread and review. Interactive turns only; does not wake an agent.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.transitionDeal
      .omit({ organizationId: true, action: true })
      .extend({ stageId: id.optional().describe("Omit to keep the deal's current stage.") })
      .strict(),
    output: recordResult,
  },
  list_crm_interactions: {
    title: "Read a record's CRM interactions",
    description:
      "Read the interaction history of a contact, account or deal, newest occurrence first with entity ID as the tie-break. For an account or deal it covers its affiliated or participant contacts and interactions linked to it; set linkedOnly to keep only the linked ones. Pass nextBefore as before to continue. A manual note is not proof of customer contact. Private sources retain their separate access rules.",
    readOnly: true,
    input: z
      .object({
        entityId: id.describe("A contact, account or deal."),
        linkedOnly: z
          .boolean()
          .default(false)
          .describe("Accounts and deals only: just interactions linked to the record."),
        limit: z.number().int().min(1).max(100).default(50),
        before: interactionCursor.optional(),
      })
      .strict(),
    output: interactionItems,
  },
  search_crm_interactions: {
    title: "Search CRM interactions",
    description:
      "Find interactions across the workspace, newest first, 50 per page. Filter by period, contact, account, kind, origin or words in the contact name or summary. A period is from (inclusive) to until (exclusive), at most 32 days; omit both for all time. Pass nextBefore as before to continue with the same filters.",
    readOnly: true,
    input: z
      .object({
        from: timestamp.optional(),
        until: timestamp.optional(),
        contactEntityId: id.optional(),
        accountEntityId: id
          .optional()
          .describe("Interactions of the account's affiliated contacts and linked to it."),
        kind: interactionFields.shape.kind.optional(),
        origin: z
          .enum(["manual", "message_publication", "calendar_event"])
          .optional()
          .describe("manual | message_publication | calendar_event"),
        search: z.string().trim().min(1).max(200).optional(),
        before: interactionCursor.optional(),
      })
      .strict()
      .refine((value) => !value.from === !value.until, "Supply both from and until, or neither.")
      .refine(
        (value) =>
          !value.from ||
          !value.until ||
          (Date.parse(value.until) > Date.parse(value.from) &&
            Date.parse(value.until) - Date.parse(value.from) <= 32 * 86_400_000),
        "A period must end after it starts and last at most 32 days.",
      ),
    output: interactionItems,
  },
  get_crm_interaction: {
    title: "Read CRM interaction",
    description:
      "Read one interaction in full: its contact, kind, times, summary, origin, your access level, whether its contact is archived, and the records linked to it.",
    readOnly: true,
    input: z.object({ entityId: id }).strict(),
    output: record,
  },
  update_crm_interaction: {
    title: "Correct CRM interaction summary",
    description:
      "Replace an interaction's summary to correct it. The kind, times and contact do not change. Read it first with get_crm_interaction. Interactive turns only; no notifications or wakes.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.updateInteraction
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: recordResult,
  },
  create_crm_interaction: {
    title: "Record manual CRM interaction",
    description:
      "Record an observed manual customer interaction and occurrence time. Use it when your owner tells you about a call, meeting, email or note; their request is the approval, so record it without asking again. Do not copy private messages through this tool: it does not preserve message provenance or publication consent. Interactive turns only; no notifications or wakes.",
    readOnly: false,
    idempotent: true,
    input: mutations.createInteraction
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: recordResult,
  },
  publish_crm_interaction: {
    title: "Publish message as CRM interaction",
    description:
      "Publish an owner-approved summary from a readable message with structured provenance. Your owner must approve the summary and its audience, everyone in the workspace, who can retain the summary after source access changes. A request from your owner in this turn to record this message is that approval. Set consentToContactAudience only with that approval. Deduplicates by contact/message and preserves later summary edits on retry. Interactive turns only; does not wake agents.",
    readOnly: false,
    idempotent: true,
    input: mutations.publishInteraction.omit({ organizationId: true, action: true }).strict(),
    output: recordResult,
  },
  find_crm_contacts: {
    title: "Find contacts by email or phone",
    description:
      "Find contacts that have this exact email address or phone number. Phone numbers match in any format; set countryCode for a number without a country prefix. A match is a candidate, not proof of identity. Use before creating a contact or adding a detail.",
    readOnly: true,
    input: contactIdentifierSearch.omit({ organizationId: true }).strict(),
    output: z.object({ items: z.array(z.object({ entityId: id, displayName: z.string() })) }),
  },
  change_crm_contact_detail: {
    title: "Change contact email, phone, address or URL",
    description:
      "Add, update or remove one email or phone (identifier), postal address or web URL on a contact. Update and remove take the detail id from get_crm_record. An update replaces the detail's fields. A phone number needs its country: set countryCode, such as US, or write the number with its + prefix. isPrimary true makes it the primary of its kind. Never invent details; record only what a person or message states. Interactive turns only. Returns the contact.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    // One flat object: some MCP clients show no fields for a tool whose input is a union. The
    // server checks the fields of each action with the contact form's own schema.
    input: z
      .object({
        requestId,
        action: z
          .enum(contactDetailActions)
          .describe(
            "add, update or remove an Identifier (an email or phone), an Address or a Url. Use add for a new number or address; update replaces an existing one.",
          ),
        contactEntityId: id,
        id: id
          .optional()
          .describe("The detail's id from get_crm_record. Needed to update or remove."),
        type: z.enum(["email", "phone"]).optional().describe("Identifier: email or phone."),
        value: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .optional()
          .describe("Identifier: the email address or phone number."),
        extension: z
          .string()
          .regex(/^[0-9]+$/)
          .max(20)
          .nullable()
          .optional(),
        countryCode: z
          .string()
          .length(2)
          .optional()
          .describe(
            "Two letters, such as US: of a phone number without a + prefix, or of an address.",
          ),
        label: detailText.describe("Such as Work or Mobile."),
        isPrimary: z.boolean().optional(),
        url: z
          .url({ protocol: /^https?$/ })
          .max(4000)
          .optional()
          .describe("Url: the address."),
        streetAddress: detailText,
        extendedAddress: detailText,
        city: detailText,
        region: detailText,
        postalCode: detailText,
        formattedAddress: detailText,
      })
      .strict(),
    output: contactResult,
  },
  set_crm_affiliation: {
    title: "Link a contact to an account",
    description:
      "Record that a contact works at or represents an account, with an optional job title. isPrimary true makes this the contact's primary account. Repeating it with a new title or isPrimary updates the link. Needs edit access on the account; neither record may be archived. Interactive turns only. Returns the contact.",
    readOnly: false,
    idempotent: true,
    input: mutations.setAffiliation
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: contactResult,
  },
  remove_crm_affiliation: {
    title: "Unlink a contact from an account",
    description:
      "Remove the link between a contact and an account. Neither record changes otherwise. Interactive turns only. Returns the contact.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.removeAffiliation
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: contactResult,
  },
  archive_crm_record: {
    title: "Archive or restore CRM record",
    description:
      "Archive an account, contact or deal, or restore it with archived false. An archived record keeps its history but takes no new links or interactions. Needs edit access. Interactive turns only. Returns the record.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: z
      .object({
        requestId,
        kind,
        entityId: id,
        archived: z.boolean().describe("true archives the record; false restores it."),
      })
      .strict(),
    output: z.object({ record }),
  },
  delete_crm_interaction: {
    title: "Delete CRM interaction",
    description:
      "Delete an interaction. You can delete interactions your owner wrote, or any interaction if your owner is an organization admin. Your owner approves every deletion: the call returns APPROVAL_PENDING, and the result arrives as a new item in a later turn. Do not retry it.",
    readOnly: false,
    destructive: true,
    approval: "owner",
    input: z.object({ requestId, entityId: id }).strict(),
    output: z.object({ deleted: z.literal(true), entityId: id }),
  },
  assign_crm_owner: {
    title: "Change CRM record owner",
    description:
      "Make a person responsible for an account or deal. Read the record first and pass its current ownerActorEntityId as expectedOwnerActorEntityId, and a deal's version as expectedVersion. accessDecision require_existing_access fails unless the person can already read the record; keep_restricted assigns without sharing. Only people, never agents. Interactive turns only.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.assignOwner
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: z.object({ entityId: id, ownerActorEntityId: id }),
  },
  share_crm_record: {
    title: "Share CRM record",
    description:
      "Give a person view, comment, edit or owner access to an account or deal, or change their level. Only people, never agents. Needs owner access. Interactive turns only.",
    readOnly: false,
    idempotent: true,
    input: mutations.share
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: z.object({ entityId: id }),
  },
  revoke_crm_access: {
    title: "Remove CRM record access",
    description:
      "Remove a person's direct access to an account or deal. The last owner cannot be removed. Needs owner access. Interactive turns only.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.revoke
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: z.object({ entityId: id }),
  },
  list_crm_follow_ups: {
    title: "List a CRM record's open follow-ups",
    description:
      "List open tasks linked to an account, contact or deal that you can read, earliest due date first, with the next dated one as nextAction. Use get_task for a task in full.",
    readOnly: true,
    input: z.object({ entityId: id }).strict(),
    output: z.object({
      tasks: z.array(
        z.object({
          entityId: id,
          projectEntityId: id,
          title: z.string(),
          status: z.string(),
          dueDate: z.iso.date().nullable(),
          assigneeActorEntityId: id.nullable(),
        }),
      ),
      nextAction: z.object({ entityId: id, dueDate: z.iso.date().nullable() }).nullable(),
    }),
  },
} as const;
