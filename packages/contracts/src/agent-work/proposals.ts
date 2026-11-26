import { conversationKind } from "../messaging/input.ts";
import { utcTimestamp } from "../timestamps.ts";
import { z } from "zod";

const id = z.uuid();

/**
 * A tool call that waits for the owner. The server stores it when an agent calls a tool that
 * needs approval: a deletion. Approval runs exactly this call, as
 * the agent. input is the tool's parsed input without requestId; the server parses it again with
 * the tool's own schema before it runs.
 */
export const proposalAction = z.strictObject({
  tool: z.string().min(1).max(100),
  input: z.record(z.string(), z.json()),
});
export type ProposalAction = z.output<typeof proposalAction>;

const version = utcTimestamp;

/**
 * The state of the records the call names, when it was proposed. Approval runs the call only
 * while they still match, so the owner approves what the agent saw. entities holds each named
 * task, project or CRM record and its last change; conversations holds each named conversation
 * and its audience. Server-only; never sent to views.
 */
export const proposalTargetBasis = z.strictObject({
  entities: z.record(id, version),
  conversations: z.record(id, z.strictObject({ kind: conversationKind, private: z.boolean() })),
});
export type ProposalTargetBasis = z.infer<typeof proposalTargetBasis>;

export const staleProposalError =
  "The target changed after this was proposed. Ask the agent to try again.";

/**
 * What happened after the owner decided. The receipt links forward to the created or changed
 * record. A deleted record has nothing to open, so its receipt only names it. done is a call
 * whose result names no single record.
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
      z.strictObject({ kind: z.literal("done"), tool: z.string() }),
    ]),
    /**
     * The tool's own output, as the call would have returned it. The home desktop gives it to
     * the agent when the owner approves while the call still waits.
     */
    result: z.json().optional(),
  }),
  z.strictObject({ status: z.literal("failed"), error: z.string().max(2000) }),
]);
export type ProposalOutcome = z.infer<typeof proposalOutcome>;

/** The error code a tool call returns when it waits for the owner's approval. */
export const approvalPendingCode = "APPROVAL_PENDING";

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
