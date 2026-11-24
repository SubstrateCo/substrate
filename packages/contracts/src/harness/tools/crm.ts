import { contactWrite } from "../../contacts/input.ts";
import { interactionWrite } from "../../context/interactions.ts";
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
    title: "Read CRM interactions",
    description:
      "Read historical interactions permitted through a contact, newest occurrence first with entity ID as the tie-break. Pass nextBefore as before to continue. A manual note is not proof of customer contact. Private sources retain their separate access rules.",
    readOnly: true,
    input: z
      .object({
        contactEntityId: id,
        limit: z.number().int().min(1).max(100).default(50),
        before: interactionCursor.optional(),
      })
      .strict(),
    output: z.object({
      items: z.array(record),
      nextBefore: interactionCursor
        .nullable()
        .describe("Continuation when more interactions follow; null on the last page."),
    }),
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
} as const;
