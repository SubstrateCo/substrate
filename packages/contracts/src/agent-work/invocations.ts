import type { AgentCallerPolicy } from "../agents/callers.ts";
import { organizationId } from "../workspace.ts";
import type { AgentRequestPlace } from "./request-views.ts";
import { z } from "zod";

// Calls of an agent by a person other than its owner. The owner sees and decides them; the
// caller sees only the status of their own calls.

export const agentInvocationStatuses = [
  "received",
  "pending_approval",
  "admitted",
  "rate_limited",
  "declined",
  "expired",
  "cancelled",
  "dropped",
] as const;
export type AgentInvocationStatus = (typeof agentInvocationStatuses)[number];

/** Caller triggers: a mention, or a reply in a thread where the agent answered that caller. */
export const agentInvocationKinds = ["mention", "thread_reply"] as const;
export type AgentInvocationKind = (typeof agentInvocationKinds)[number];

/**
 * Why an admitted call dropped before it ran. revoked: the source check found that it may not run
 * any more. desktop_needs_update: the agent's home desktop cannot run caller calls and withheld
 * its wake for a day.
 */
export const agentInvocationDropReasons = ["revoked", "desktop_needs_update"] as const;
export type AgentInvocationDropReason = (typeof agentInvocationDropReasons)[number];
/** A caller wake withheld from a desktop without caller_wakes this long drops its call. */
export const withheldCallerWakeMs = 24 * 60 * 60_000;

/** Pending calls expire after this long. */
export const invocationApprovalMs = 24 * 60 * 60_000;
/** Pending calls per caller per agent. More are recorded as rate_limited. */
export const maxPendingInvocationsPerCaller = 3;
/**
 * Admitted caller calls per agent in the last 24 hours, owner approvals included. More automatic
 * admissions are recorded as rate_limited; the cap never blocks an owner approval.
 */
export const maxAdmittedInvocationsPerDay = 100;

/** A call as the agent's owner sees it now. A hidden place has no IDs, names or preview. */
export interface AgentInvocationView {
  id: string;
  userAgentId: string;
  agent: { actorId: string; name: string };
  caller: { actorId: string; name: string };
  kind: AgentInvocationKind;
  status: AgentInvocationStatus;
  /** Why a dropped call dropped; null otherwise, and for calls dropped before reasons were stored. */
  dropReason: AgentInvocationDropReason | null;
  /** The policy when the call arrived. */
  policy: AgentCallerPolicy;
  /** The caller was allowlisted when the call arrived. */
  allowlisted: boolean;
  /** anchorMessageId is the caller's message. */
  place: Exclude<AgentRequestPlace, { access: "none" }>;
  /** The start of the caller's message, only while the place is visible. */
  preview: string | null;
  createdAt: string;
  decidedAt: string | null;
  expiresAt: string;
}

/**
 * What a caller learns about their own call. queued: admitted, and the agent has not published
 * a reply for it yet. answered: the agent published a reply in a turn that answered this call.
 */
export const agentCallStatuses = ["waiting", "queued", "answered", "declined", "expired"] as const;
export type AgentCallStatus = (typeof agentCallStatuses)[number];

const callStatusOf: Record<AgentInvocationStatus, AgentCallStatus> = {
  received: "waiting",
  pending_approval: "waiting",
  admitted: "queued",
  rate_limited: "declined",
  declined: "declined",
  expired: "expired",
  cancelled: "declined",
  dropped: "declined",
};

/**
 * The caller's view of an invocation. A pending call past its expiry is expired. An admitted or
 * dropped call with a published reply is answered. A call dropped because the owner's desktop
 * needs an update is expired: nobody declined it.
 */
export function callStatus(
  status: AgentInvocationStatus,
  facts: { expired: boolean; answered: boolean; dropReason: AgentInvocationDropReason | null },
): AgentCallStatus {
  if (status === "pending_approval" && facts.expired) return "expired";
  if ((status === "admitted" || status === "dropped") && facts.answered) return "answered";
  if (status === "dropped" && facts.dropReason === "desktop_needs_update") return "expired";
  return callStatusOf[status];
}

/** The caller's own call on one of their messages. */
export interface AgentCallStatusView {
  invocationId: string;
  messageId: string;
  agent: { actorId: string; name: string };
  status: AgentCallStatus;
  updatedAt: string;
}

/** Audited actions on an agent's calls. Rows hold IDs and codes, never message bodies. */
export const agentAuditActions = [
  "policy_changed",
  "caller_allowed",
  "caller_removed",
  "invocation_admitted",
  "invocation_held",
  "invocation_rate_limited",
  "invocation_approved",
  "invocation_declined",
  "invocation_expired",
  "invocation_cancelled",
  "invocation_dropped",
  "mcp_call",
] as const;
export type AgentAuditAction = (typeof agentAuditActions)[number];

/** One row of the owner's Calls log. */
export interface AgentAuditEventView {
  id: string;
  userAgentId: string;
  action: AgentAuditAction;
  /** The person who acted: the owner, or null for automatic admission decisions. */
  actorUserId: string | null;
  invocationId: string | null;
  callerActorId: string | null;
  /** The MCP tool, for mcp_call. */
  tool: string | null;
  access: "read" | "write" | null;
  /** IDs the action touched, such as a policy value or a created message ID. */
  targetIds: string[];
  /** ok, or the error code of a failed call. */
  result: string | null;
  turnId: string | null;
  createdAt: string;
}

const id = z.uuid();

/** GET /agent-work/invocations. The owner's calls, newest first; one agent when set. */
export const listInvocationsInput = z.strictObject({ organizationId, userAgentId: id.optional() });
/** The :id route parameter of invocation actions. */
export const invocationParams = z.strictObject({ id });
/** POST /agent-work/invocations/:id/decide. always_allow approves and allowlists the caller. */
export const decideInvocationInput = z.strictObject({
  organizationId,
  decision: z.enum(["approve", "always_allow", "decline"]),
});
export type DecideInvocationInput = z.input<typeof decideInvocationInput>;
/** GET /agent-work/calls. The owner's Calls log of one agent. */
export const callsLogInput = z.strictObject({ organizationId, userAgentId: id });
/** GET /agent-work/calls/mine. The caller's own calls in one conversation they can see. */
export const myCallsInput = z.strictObject({ organizationId, conversationId: id });
