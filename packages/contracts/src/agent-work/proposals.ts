import { taskTools } from "../harness/tools/tasks.ts";
import { z } from "zod";

const id = z.uuid();

/** Actions an agent may propose. Approval executes exactly the proposed action, as the agent. */
export const proposalActionTypes = ["reply_elsewhere", "create_task", "update_task"] as const;
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
]);
export type ProposalAction = z.output<typeof proposalAction>;

export const proposalSummary = z.string().trim().min(1).max(2000);

const version = z.iso.datetime({ offset: true });

/**
 * The state of the action's targets when it was proposed. Approval runs the action only while the
 * targets still match, so the owner approves what the agent saw. Server-only; never sent to views.
 */
export const proposalTargetBasis = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("reply_elsewhere"),
    conversationId: id,
    threadId: id.nullable(),
    kind: z.enum(["dm", "group", "channel"]),
    private: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("create_task"),
    projectUpdatedAt: version,
    parentTaskUpdatedAt: version.nullable(),
  }),
  z.strictObject({ type: z.literal("update_task"), taskUpdatedAt: version }),
]);
export type ProposalTargetBasis = z.infer<typeof proposalTargetBasis>;

export const staleProposalError =
  "The target changed after this was proposed. Ask the agent to propose again.";

/** What happened after the owner decided. The receipt links forward to the created record. */
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
