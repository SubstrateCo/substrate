import { inboxLanes, inboxSources, inboxStatuses, type InboxSourceRef } from "../turns.ts";
import { agentWakeRequestDetail } from "../wakes.ts";
import { z } from "zod";

/** A server ID in a response. The host does not check its format. */
export const ref = z.string().min(1);

/** The most message IDs in one passive thread_context item. */
export const threadContextBatchLimit = 20;

const inboxSourceRefSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("thread_context"),
    messageIds: z.array(ref).min(1).max(threadContextBatchLimit),
    targetTurnId: ref,
    conversationId: ref,
    threadId: ref,
  }),
  z.strictObject({
    source: z.literal("owner_message"),
    messageId: ref,
    conversationId: ref,
    threadId: ref.nullable(),
  }),
  z.strictObject({ source: z.literal("answer"), requestId: ref, anchorMessageId: ref.nullable() }),
  z.strictObject({
    source: z.literal("approval_result"),
    requestId: ref,
    anchorMessageId: ref.nullable(),
  }),
  z.strictObject({
    source: z.literal("routine"),
    routineId: ref,
    revision: z.number().int(),
    scheduledAt: z.string(),
  }),
  z.strictObject({ source: z.literal("helper_task"), helperId: ref }),
  z.strictObject({ source: z.literal("helper_result"), helperId: ref }),
  z.strictObject({ source: z.literal("recovery"), turnId: ref }),
  z.strictObject({ source: z.literal("epoch"), fromEpoch: z.number().int().min(0) }),
]) satisfies z.ZodType<InboxSourceRef>;

/** A work item as the host runs it: in a claimed batch, or steered into a live turn. */
export const hostItem = z.object({
  id: ref,
  sessionId: ref,
  source: z.enum(inboxSources),
  sourceRef: inboxSourceRefSchema,
  /**
   * Text the server owns, such as a routine prompt, a helper task or a resume note. Message
   * bodies are never here: load them with /device/sources, which re-checks access.
   */
  body: z.string().nullable(),
  lane: z.enum(inboxLanes),
  status: z.enum(inboxStatuses),
  /** Sent into a live turn with steer, not as the turn's first input. */
  steered: z.boolean(),
  /** The decided request of an answer or approval_result item. */
  request: agentWakeRequestDetail.nullable(),
  createdAt: z.string(),
});
export type HostItem = z.infer<typeof hostItem>;
