import { taskTools } from "../harness/tools/tasks.ts";
import { conversationKind } from "../messaging/input.ts";
import { permissionLevels } from "../tasks/status.ts";
import { utcTimestamp } from "../timestamps.ts";
import { z } from "zod";

const id = z.uuid();
const projectInput = z.strictObject({ projectId: id });
const memberId = id.describe("A person's actor ID, from get_project members or list_assignees.");

/** Actions an agent may propose. Approval executes exactly the proposed action, as the agent. */
export const proposalActionTypes = [
  "reply_elsewhere",
  "create_task",
  "update_task",
  "delete_task",
  "archive_project",
  "restore_project",
  "delete_project",
  "share_project",
  "revoke_project_access",
  "archive_crm_record",
  "delete_crm_interaction",
  "assign_crm_owner",
  "share_crm_record",
  "revoke_crm_access",
] as const;
export type ProposalActionType = (typeof proposalActionTypes)[number];

export const proposalAction = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("reply_elsewhere"),
    input: z.strictObject({
      conversationId: id,
      threadId: id.optional().describe("The root message ID of the thread to reply in."),
      body: z
        .string()
        .trim()
        .min(1)
        .max(20000)
        .describe("Markdown. Mention records only with @[kind:uuid] tokens."),
    }),
  }),
  z.strictObject({
    type: z.literal("create_task"),
    // The server supplies the requestId when the owner approves.
    input: taskTools.create_task.input.omit({ requestId: true }),
  }),
  z.strictObject({
    type: z.literal("update_task"),
    input: taskTools.update_task.input.pick({ taskId: true, changes: true }),
  }),
  z.strictObject({
    type: z.literal("delete_task"),
    input: z.strictObject({ taskId: id.describe("Its subtasks are deleted too.") }),
  }),
  z.strictObject({ type: z.literal("archive_project"), input: projectInput }),
  z.strictObject({ type: z.literal("restore_project"), input: projectInput }),
  z.strictObject({
    type: z.literal("delete_project"),
    input: z.strictObject({ projectId: id.describe("An archived project. Archive it first.") }),
  }),
  z.strictObject({
    type: z.literal("share_project"),
    input: z.strictObject({
      projectId: id,
      actorId: memberId,
      level: z.enum(permissionLevels).describe("view | comment | edit | owner"),
    }),
  }),
  z.strictObject({
    type: z.literal("revoke_project_access"),
    input: z.strictObject({ projectId: id, actorId: memberId }),
  }),
  z.strictObject({
    type: z.literal("archive_crm_record"),
    input: z.strictObject({
      kind: z.enum(["account", "contact", "deal"]),
      entityId: id,
      archived: z.boolean().describe("true archives the record; false restores it."),
    }),
  }),
  z.strictObject({
    type: z.literal("delete_crm_interaction"),
    input: z.strictObject({
      entityId: id.describe(
        "An interaction your owner wrote, or any one if your owner is an admin.",
      ),
    }),
  }),
  z.strictObject({
    type: z.literal("assign_crm_owner"),
    input: z.strictObject({
      entityId: id.describe("An account or deal."),
      ownerActorId: memberId.describe("The person who becomes responsible for the record."),
      accessDecision: z
        .enum(["require_existing_access", "keep_restricted"])
        .describe(
          "require_existing_access fails unless the person can already read the record. keep_restricted assigns without sharing.",
        ),
    }),
  }),
  z.strictObject({
    type: z.literal("share_crm_record"),
    input: z.strictObject({
      entityId: id.describe("An account or deal."),
      actorId: memberId,
      level: z.enum(permissionLevels).describe("view | comment | edit | owner"),
    }),
  }),
  z.strictObject({
    type: z.literal("revoke_crm_access"),
    input: z.strictObject({ entityId: id.describe("An account or deal."), actorId: memberId }),
  }),
]);
export type ProposalAction = z.output<typeof proposalAction>;

export const proposalSummary = z.string().trim().min(1).max(2000);

const version = utcTimestamp;

/**
 * The state of the action's targets when it was proposed. Approval runs the action only while the
 * targets still match, so the owner approves what the agent saw. Server-only; never sent to views.
 */
export const proposalTargetBasis = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("reply_elsewhere"),
    conversationId: id,
    threadId: id.nullable(),
    kind: conversationKind,
    private: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("create_task"),
    projectUpdatedAt: version,
    parentTaskUpdatedAt: version.nullable(),
  }),
  z.strictObject({ type: z.literal("update_task"), taskUpdatedAt: version }),
  z.strictObject({ type: z.literal("delete_task"), taskUpdatedAt: version }),
  z.strictObject({ type: z.literal("archive_project"), projectUpdatedAt: version }),
  z.strictObject({ type: z.literal("restore_project"), projectUpdatedAt: version }),
  z.strictObject({ type: z.literal("delete_project"), projectUpdatedAt: version }),
  z.strictObject({ type: z.literal("share_project"), projectUpdatedAt: version }),
  z.strictObject({ type: z.literal("revoke_project_access"), projectUpdatedAt: version }),
  z.strictObject({ type: z.literal("archive_crm_record"), recordUpdatedAt: version }),
  z.strictObject({ type: z.literal("delete_crm_interaction"), recordUpdatedAt: version }),
  z.strictObject({ type: z.literal("assign_crm_owner"), recordUpdatedAt: version }),
  z.strictObject({ type: z.literal("share_crm_record"), recordUpdatedAt: version }),
  z.strictObject({ type: z.literal("revoke_crm_access"), recordUpdatedAt: version }),
]);
export type ProposalTargetBasis = z.infer<typeof proposalTargetBasis>;

export const staleProposalError =
  "The target changed after this was proposed. Ask the agent to propose again.";

/**
 * What happened after the owner decided. The receipt links forward to the created or changed
 * record. A deleted record has nothing to open, so its receipt only names it.
 */
export const proposalOutcome = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("declined") }),
  z.strictObject({
    status: z.literal("executed"),
    receipt: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("message"),
        id,
        conversationId: id,
        threadId: id.nullable(),
      }),
      z.strictObject({ kind: z.literal("task"), id, projectId: id }),
      z.strictObject({ kind: z.literal("project"), id }),
      z.strictObject({
        kind: z.literal("crm"),
        entityType: z.enum(["account", "contact", "deal"]),
        id,
      }),
      z.strictObject({
        kind: z.literal("deleted"),
        entityType: z.enum(["task", "project", "contact_interaction"]),
        id,
      }),
    ]),
  }),
  z.strictObject({ status: z.literal("failed"), error: z.string().max(2000) }),
]);
export type ProposalOutcome = z.infer<typeof proposalOutcome>;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

/**
 * JSON with object keys sorted by UTF-16 code units at every level and no whitespace.
 * Undefined object fields are left out, so equal parsed values always produce equal text.
 */
export function canonicalJson(value: JsonValue): string {
  const keys = new Set<string>();
  JSON.stringify(value, (key, field: JsonValue | undefined) => {
    if (field === Infinity || field === -Infinity || Number.isNaN(field))
      throw new TypeError("canonicalJson accepts finite numbers only");
    // A property list reads keys through the prototype, so `__proto__` would appear in every object.
    if (key === "__proto__") throw new TypeError("canonicalJson does not accept __proto__ keys");
    keys.add(key);
    return field;
  });
  // A property list writes each object's own keys in list order and leaves arrays unchanged.
  return JSON.stringify(value, [...keys].sort());
}

/** Hex SHA-256 of the canonical JSON of a parsed action. Stored as agent_requests.action_hash. */
export async function proposalActionHash(action: ProposalAction) {
  const bytes = new TextEncoder().encode(canonicalJson(action));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
