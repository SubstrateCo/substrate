import { organizationId } from "../../workspace.ts";
import { agentActivityMaxLength } from "../status.ts";
import { turnAttentionReasons, turnInterruptions, turnOutcomes } from "../turns.ts";
import { turnSourceMessageSchema, turnUsageSchema } from "./turns.ts";
import { z } from "zod";

// Host calls under /agent-work/host/*. The device scope resolves the host from the session and
// the installation; the server derives every agent, session and turn from its own rows.

const id = z.uuid();
const device = { organizationId, installationId: id };
/** The attempt the host runs. A call for an older attempt changes nothing. */
const attempt = z.number().int().min(1).max(1000);
const itemIds = (max: number) => z.array(id).max(max).default([]);
/**
 * Proposals whose decision a held tool call of the turn returned to the agent. Their
 * approval_result items in the turn's session are consumed, so they never start a turn.
 */
const decidedRequestIds = z.array(id).max(100).optional();

/** The :id route parameter of turn and item calls. */
export const hostParams = z.strictObject({ id });

/** POST /host/claim */
export const hostClaimInput = z.strictObject({
  ...device,
  /** Folders the host holds without a live turn, such as during native compaction. */
  busyFolders: z.array(z.string().min(1).max(200)).max(20).default([]),
});

/** POST /host/sync: this device's live turns. */
export const hostSyncInput = z.strictObject(device);

/** POST /host/turns/:id/start */
export const hostStartInput = z.strictObject({
  ...device,
  attempt,
  /** Batch items whose source the owner cannot see any more. They are dropped first. */
  droppedItemIds: itemIds(20),
});

/** POST /host/turns/:id/progress */
export const hostProgressInput = z.strictObject({
  ...device,
  attempt,
  /** waiting: the turn waits for the owner. running: it runs again. */
  state: z.enum(["running", "waiting"]).optional(),
  activity: z.string().max(agentActivityMaxLength).nullable().optional(),
  usage: turnUsageSchema.optional(),
  /** The turn's visible source messages, for placement. Recorded once, before the turn runs. */
  sourceMessages: z.array(turnSourceMessageSchema).max(100).optional(),
  /** Items the harness reported as read. */
  consumedItemIds: itemIds(100),
  decidedRequestIds,
  /** The turn was told to wrap up, so it never continues by itself. */
  wrappedUp: z.literal(true).optional(),
});

/** POST /host/turns/:id/finish */
export const hostFinishInput = z.strictObject({
  ...device,
  attempt,
  status: z.enum(["completed", "cancelled", "interrupted", "needs_attention", "failed"]),
  outcome: z.enum(turnOutcomes).nullable().default(null),
  error: z.string().max(2000).nullable().default(null),
  attentionReason: z.enum(turnAttentionReasons).nullable().default(null),
  /** Who ended the turn early, when it ended early. */
  interruption: z.enum(turnInterruptions).nullable().default(null),
  /** Items the harness reported as read. */
  consumedItemIds: itemIds(100),
  /** Steered items that an interrupt receipt reported as still queued. */
  stillQueuedItemIds: itemIds(100),
  decidedRequestIds,
  usage: turnUsageSchema.nullable().default(null),
  /** Queues a recovery item, so that the session's next turn continues this turn's work. */
  resume: z.string().min(1).max(2000).optional(),
});

/** POST /host/turns/:id/retry-later: the turn could not start for a passing reason. */
export const hostRetryLaterInput = z.strictObject({
  ...device,
  attempt,
  delayMs: z
    .number()
    .int()
    .min(0)
    .max(60 * 60_000),
});

/** POST /host/turns/:id/recover: the turn's harness process died. */
export const hostRecoverInput = z.strictObject({
  ...device,
  attempt,
  /** The host's transcript has a tool call of this attempt that never finished. */
  unfinishedTool: z.boolean(),
});

/** POST /host/turns/:id/steer: claims waiting items that can join the live turn. */
export const hostSteerInput = z.strictObject({
  ...device,
  attempt,
  /** The harness proved it can take input during a turn. */
  harnessCanSteer: z.boolean(),
  /** Proposals that a held tool call of the turn waits on. Their results do not steer. */
  awaitingRequestIds: itemIds(100),
});

/** POST /host/items/:id/steer-result */
export const hostSteerResultInput = z.strictObject({
  ...device,
  /** The turn the item was steered into. */
  turnId: id,
  /**
   * delivered: the harness took it. undelivered: the steer proved it was not delivered, so it
   * waits again. uncertain: unknown; the owner resends or discards it. inaccessible: the owner
   * cannot see its source any more, so it is dropped.
   */
  result: z.enum(["delivered", "undelivered", "uncertain", "inaccessible"]),
});

/** POST /host/items: work the host creates. Only epoch handoffs. */
export const hostSubmitItemInput = z.strictObject({
  ...device,
  sessionId: id,
  source: z.literal("epoch"),
  /** The host's epoch that the handoff ends. */
  fromEpoch: z.number().int().min(0),
  body: z.string().trim().min(1).max(20_000),
});

export type HostFinishInput = z.output<typeof hostFinishInput>;
export type HostProgressInput = z.output<typeof hostProgressInput>;
