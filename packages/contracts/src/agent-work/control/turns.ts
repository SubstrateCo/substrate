import { turnKinds } from "../../harness-runtime/runtime.ts";
import {
  agentSessionResetReasons,
  agentSessionStatuses,
  inboxStatuses,
  turnAttentionReasons,
  turnInterruptions,
  turnStatuses,
} from "../turns.ts";
import { agentSessionKinds } from "../wakes.ts";
import { hostItem, ref } from "./items.ts";
import { z } from "zod";

const place = z.object({ conversationId: ref, threadId: ref.nullable() });

/** Token counts as the harness reported them. */
export const turnUsageSchema = z.strictObject({
  inputTokens: z.number().min(0).optional(),
  outputTokens: z.number().min(0).optional(),
  cachedInputTokens: z.number().min(0).optional(),
  contextUsed: z.number().min(0).optional(),
  contextWindow: z.number().min(0).optional(),
});

/** A source message of the turn that the owner could see when the host loaded it. */
export const turnSourceMessageSchema = z.strictObject({
  messageId: z.uuid(),
  conversationId: z.uuid(),
  threadId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

/** A session as the host needs it to route and open a turn. */
export const hostSession = z.object({
  id: ref,
  userAgentId: ref,
  key: z.string(),
  kind: z.enum(agentSessionKinds),
  status: z.enum(agentSessionStatuses),
  parentSessionId: ref.nullable(),
  /** The helper this session belongs to, for helper sessions. */
  helperId: ref.nullable(),
  /** Where the work came from. Null for routine and helper sessions. */
  origin: place.nullable(),
  /** Where unattended work publishes, such as a routine's destination. */
  destination: place.nullable(),
  /**
   * Grows when the owner resets the session's context. A host whose native session was opened
   * with a lower generation opens a fresh one before it runs the turn.
   */
  resetGeneration: z.number().int().min(0),
  resetReason: z.enum(agentSessionResetReasons).nullable(),
});
export type HostSession = z.infer<typeof hostSession>;

export const hostTurnSummary = z.object({
  id: ref,
  userAgentId: ref,
  sessionId: ref,
  /** One live turn per folder: main:<agentId> or helper:<helperId>. */
  folderKey: z.string(),
  kind: z.enum(turnKinds),
  status: z.enum(turnStatuses),
  attempt: z.number().int().min(1),
  generation: z.number().int().min(1),
  /** The epoch handoff turn of its session: it saves notes and must not publish. */
  handoff: z.boolean(),
  interruption: z.enum(turnInterruptions).nullable(),
  recoveries: z.number().int().min(0),
  /** False once the turn was told to wrap up, so it never continues by itself. */
  autoContinue: z.boolean(),
  /** Recovery turns: the turn this one resumes. */
  resumesTurnId: ref.nullable(),
  /** The lease this device holds. Heartbeats and turn reports renew it. */
  leaseExpiresAt: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
});

/** A live turn that this device holds, with its session and the items it runs. */
export const hostTurn = z.object({
  turn: hostTurnSummary,
  session: hostSession,
  /** The turn's batch and its steered items that are not settled yet. */
  items: z.array(hostItem),
});
export type HostTurn = z.infer<typeof hostTurn>;

/** POST /host/claim and POST /host/sync */
export const hostTurnsResult = z.object({ turns: z.array(hostTurn) });

/** POST /host/turns/:id/start and /progress: the turn's status after the call. */
export const hostTurnStatusResult = z.object({ status: z.enum(turnStatuses) });

/** POST /host/turns/:id/finish */
export const hostFinishResult = z.object({
  status: z.enum(turnStatuses),
  consumed: z.array(ref),
  requeued: z.array(ref),
  uncertain: z.array(ref),
});
export type HostFinishResult = z.infer<typeof hostFinishResult>;

/** POST /host/turns/:id/retry-later */
export const hostRetryLaterResult = z.object({
  /** requeued: the turn never ran; its batch waits again. kept: the host retries it later. */
  result: z.enum(["requeued", "kept"]),
});

/** POST /host/turns/:id/recover: what the server did with the turn. */
export const recoveryDecision = z.discriminatedUnion("action", [
  z.object({ action: z.literal("continue") }),
  z.object({ action: z.literal("needs_attention"), reason: z.enum(turnAttentionReasons) }),
  z.object({ action: z.literal("requeued") }),
  z.object({ action: z.enum(["cancelled", "interrupted"]) }),
]);
export type RecoveryDecision = z.infer<typeof recoveryDecision>;

/** POST /host/turns/:id/steer */
export const hostSteerResult = z.object({
  /** Items now submitted to the turn as steered. Steer each one, then report its result. */
  items: z.array(hostItem),
  /** Owner items wait for this turn's folder: wrap up a long unattended turn. */
  waiting: z.boolean(),
});
export type HostSteerResult = z.infer<typeof hostSteerResult>;

/** POST /host/items/:id/steer-result */
export const hostSteerResultResult = z.object({ status: z.enum(inboxStatuses).nullable() });

/** POST /host/items */
export const hostSubmitItemResult = z.object({ created: z.boolean() });
