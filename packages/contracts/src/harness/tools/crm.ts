import { contactIdentifierSearch, contactWrite } from "../../contacts/input.ts";
import { interactionFields, interactionWrite } from "../../context/interactions.ts";
import {
  crmActivityActions,
  crmActivityFields,
  crmActivityOptions,
  crmActivityCursor,
} from "../../crm/activity.ts";
import { crmFromMessage } from "../../crm/from-message.ts";
import { crmList, crmWrite } from "../../crm/input.ts";
import { recordLinks } from "./links.ts";
import { id, requestId, timestamp } from "./shared.ts";
import { taskResult } from "./tasks.ts";
import { z } from "zod";

const kind = z.enum(["account", "contact", "deal"]);
// CRM services own their access-filtered projections. Keep every field in the JSON boundary.
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
      "Create a confirmed new account, contact or deal from a readable same-organization message, preserving structured provenance. Search for existing records first. Get explicit approval of the exact fields and record-reader audience before setting consentToRecordAudience. associate additionally links the discussion without widening access. Returns the current public record projection. Interactive turns only; no outreach or agent wakes.",
    readOnly: false,
    idempotent: true,
    input: z.discriminatedUnion("kind", [
      crmFromMessage.options[0].omit({ organizationId: true }),
      crmFromMessage.options[1].omit({ organizationId: true }),
      crmFromMessage.options[2].omit({ organizationId: true }),
    ]),
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
      "Create an existing-domain task from an editable CRM record, preserving structured source and contextual links. Requires an accessible project and explicit approval of task text for that project's readers. dueDate is YYYY-MM-DD, not a time or reminder. Set consentToTaskAudience only after approval. Interactive turns only; no email or calendar invite.",
    readOnly: false,
    idempotent: true,
    input: mutations.createFollowUp.omit({ organizationId: true, action: true }).strict(),
    output: taskResult,
  },
  list_crm_records: {
    title: "List and search CRM records",
    description:
      "List readable customer accounts, contacts or deals. Set search to find candidates before creating a record. A name or domain match is not identity proof. To continue, pass nextAfterEntityId as afterEntityId with the same kind, search and archived; with other filters it skips matches.",
    readOnly: true,
    input: crmList.omit({ organizationId: true }).extend({ kind }).strict(),
    output: z.object({ items: z.array(record), nextAfterEntityId: id.nullable() }),
  },
  get_crm_record: {
    title: "Read CRM record",
    description:
      "Read an account, contact or deal, its permitted related records, and its newest linked messages and records. Read the deal version before updates or transitions. Relationships never grant access to another record.",
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
      "Replace the account fields supplied by this form. Read first and preserve unchanged fields. Interactive turns only; does not grant access or send outreach.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.updateAccount
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: recordResult,
  },
  create_crm_contact: {
    title: "Create CRM contact",
    description:
      "Create a canonical customer contact, not a user or messaging actor. Search for readable candidates first; never invent contact details or merge on a name match. Interactive turns only.",
    readOnly: false,
    idempotent: true,
    input: mutations.createContact
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
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
      "Create a specific sales pursuit with an account or participant contact. Read the pipeline for stageId and get_crm_settings for new-deal currency guidance. Explicit currency overrides win; null default means unset, never assume USD. Keep unknown amounts and dates null; amount and currency must be supplied together. Interactive turns only.",
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
      "Replace deal fields using its observed expectedVersion. Read first and preserve unchanged values. On conflict read again; do not overwrite blindly. Use transition_crm_deal for outcomes. Interactive turns only.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.updateDeal
      .omit({ organizationId: true, action: true })
      .extend({ requestId })
      .strict(),
    output: recordResult,
  },
  transition_crm_deal: {
    title: "Change CRM deal stage or outcome",
    description:
      "Move a deal, close it won/lost, or explicitly reopen it with outcome open. Use observed expectedVersion and a stable stageId. On conflict reread and review. Interactive turns only; does not wake an agent.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    input: mutations.transitionDeal.omit({ organizationId: true, action: true }).strict(),
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
      "Record an observed manual customer interaction and occurrence time. Do not copy private messages through this tool: it does not preserve message provenance or publication consent. Interactive turns only; no notifications or wakes.",
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
      "Publish an owner-approved summary from a readable message with structured provenance. First obtain explicit approval for the exact summary and its audience, everyone in the workspace, who can retain the summary after source access changes. Set consentToContactAudience only after that approval. Deduplicates by contact/message and preserves later summary edits on retry. Interactive turns only; does not wake agents.",
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
      "Add, update or remove one email or phone (identifier), postal address or web URL on a contact. Update and remove take the detail id from get_crm_record. An update replaces the detail's fields. isPrimary true makes it the primary of its kind. Never invent details; record only what a person or message states. Interactive turns only. Returns the contact.",
    readOnly: false,
    idempotent: true,
    destructive: true,
    // Each form action without the organization, plus a requestId.
    input: z.discriminatedUnion("action", [
      mutations.addIdentifier.omit({ organizationId: true }).extend({ requestId }).strict(),
      mutations.updateIdentifier.omit({ organizationId: true }).extend({ requestId }).strict(),
      mutations.removeIdentifier.omit({ organizationId: true }).extend({ requestId }).strict(),
      mutations.addAddress.omit({ organizationId: true }).extend({ requestId }).strict(),
      mutations.updateAddress.omit({ organizationId: true }).extend({ requestId }).strict(),
      mutations.removeAddress.omit({ organizationId: true }).extend({ requestId }).strict(),
      mutations.addUrl.omit({ organizationId: true }).extend({ requestId }).strict(),
      mutations.updateUrl.omit({ organizationId: true }).extend({ requestId }).strict(),
      mutations.removeUrl.omit({ organizationId: true }).extend({ requestId }).strict(),
    ]),
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
