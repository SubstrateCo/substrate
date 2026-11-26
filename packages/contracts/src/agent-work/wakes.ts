import { agentTriggerKinds } from "../agents/triggers.ts";
import { conversationKind } from "../messaging/input.ts";
import { agentInvocationKinds } from "./invocations.ts";
import {
  agentRequestKinds,
  agentRequestPayload,
  agentRequestResponse,
  agentRequestStatuses,
} from "./requests.ts";
import { z } from "zod";

const id = z.uuid();

/**
 * Owner-authorized server events that wake an agent. Nothing else wakes it from the server.
 * caller_message is a call that the owner's caller policy admitted.
 */
export const agentWakeSources = ["owner_message", "answer", "caller_message"] as const;
export type AgentWakeSource = (typeof agentWakeSources)[number];

/**
 * What a home desktop declares when it pulls wakes. Without caller_wakes the server holds back
 * caller_message wakes, because older desktops reject an unknown wake source.
 */
export const deviceCapabilities = ["caller_wakes"] as const;
export type DeviceCapability = (typeof deviceCapabilities)[number];

/** Why an owner message woke the agent: the owner's triggers, in agentTriggerPrecedence order. */
export const agentWakeMessageKinds = agentTriggerKinds;
export type AgentWakeMessageKind = (typeof agentWakeMessageKinds)[number];

/** References only. The desktop loads bodies through device/sources, which re-checks access. */
export const agentWakeSourceRef = z.union([
  z.strictObject({
    messageId: id,
    conversationId: id,
    threadId: id.nullable(),
    kind: z.enum(agentWakeMessageKinds),
  }),
  z.strictObject({ requestId: id }),
  z.strictObject({ invocationId: id }),
]);
export type AgentWakeSourceRef = z.infer<typeof agentWakeSourceRef>;

export const agentSessionKinds = ["dm", "thread", "routine", "helper"] as const;
export type AgentSessionKind = (typeof agentSessionKinds)[number];

/** One rolling session per DM conversation, and one per root thread elsewhere. */
export const sessionKeys = {
  dm: (conversationId: string) => `dm:${conversationId}`,
  thread: (rootMessageId: string) => `thread:${rootMessageId}`,
  routine: (routineId: string) => `routine:${routineId}`,
  helper: (helperId: string) => `helper:${helperId}`,
} satisfies Record<AgentSessionKind, (id: string) => string>;

const sessionKeyPattern = /^(dm|thread|routine|helper):(.+)$/;

/** The session kind and record ID in a session key, or null when it is not one. */
export function parseSessionKey(key: string): { kind: AgentSessionKind; id: string } | null {
  const match = sessionKeyPattern.exec(key);
  if (!match || !id.safeParse(match[2]).success) return null;
  // SAFETY: the pattern only matches the session kinds listed in agentSessionKinds.
  return { kind: match[1] as AgentSessionKind, id: match[2]! };
}

export const sessionKey = z
  .string()
  .max(200)
  .refine((key) => parseSessionKey(key) !== null, "Invalid session key");

/** The prefix of each wake dedupe key, for queries that build keys in SQL. */
export const wakeDedupePrefixes = {
  message: "msg:",
  answer: "answer:",
  call: "call:",
};

/** Unique per agent, so a repeated event never creates a second wake. */
export const wakeDedupeKeys = {
  message: (messageId: string) => `${wakeDedupePrefixes.message}${messageId}`,
  answer: (requestId: string) => `${wakeDedupePrefixes.answer}${requestId}`,
  call: (invocationId: string) => `${wakeDedupePrefixes.call}${invocationId}`,
} satisfies Record<keyof typeof wakeDedupePrefixes, (id: string) => string>;

/**
 * The answered request behind an answer wake, for the agent's own home device: what was asked
 * and the owner's answer.
 */
export const agentWakeRequestDetail = z.strictObject({
  id,
  kind: z.enum(agentRequestKinds),
  status: z.enum(agentRequestStatuses),
  /** The questions with their options. */
  payload: agentRequestPayload,
  /** The owner's answer. */
  response: agentRequestResponse.nullable(),
  anchorMessageId: id.nullable(),
  conversationId: id.nullable(),
  threadId: id.nullable(),
});
export type AgentWakeRequestDetail = z.infer<typeof agentWakeRequestDetail>;

/** A server ID in a response. The desktop does not check its format. */
const ref = z.string().min(1);

/**
 * The call behind a caller_message wake: references only. The desktop reads the body through
 * device/sources with the invocation ID, which rechecks the call and the caller's access.
 */
export const agentWakeInvocation = z.object({
  id: ref,
  messageId: ref,
  conversationId: ref,
  threadId: ref.nullable(),
  kind: z.enum(agentInvocationKinds),
  /** The caller's person actor in the agent's organization. */
  callerActorId: ref,
});
export type AgentWakeInvocation = z.infer<typeof agentWakeInvocation>;

/** A wake as the home desktop pulls it. */
export const agentWakeView = z.object({
  id: ref,
  userAgentId: ref,
  source: z.enum(agentWakeSources),
  sourceRef: agentWakeSourceRef,
  sessionKey: z.string(),
  dedupeKey: z.string(),
  createdAt: z.string(),
  /** Set for answer wakes of the owner's own agent. */
  request: agentWakeRequestDetail.nullable(),
  /** Set for caller_message wakes. Servers before caller calls leave it out. */
  invocation: agentWakeInvocation.nullable().optional(),
});
export type AgentWakeView = z.infer<typeof agentWakeView>;

/** A message body for the home desktop, returned only while the owner can see the message. */
export const agentSourceMessage = z.object({
  id: ref,
  conversationId: ref,
  threadId: ref.nullable(),
  conversationName: z.string(),
  conversationKind,
  author: z.object({
    actorId: ref,
    name: z.string(),
    kind: z.enum(["owner", "member", "agent"]),
  }),
  body: z.string(),
  createdAt: z.string(),
});
export type AgentSourceMessage = z.infer<typeof agentSourceMessage>;

export const agentSourcesResult = z.object({
  messages: z.array(agentSourceMessage),
  /** Requested IDs that the owner cannot see now, or that do not exist. */
  inaccessible: z.array(ref),
  /**
   * Requested invocations that may not run now: the policy, allowlist, or the caller's
   * membership or access changed. Their messages are left out of messages.
   */
  inaccessibleInvocations: z.array(ref).optional(),
});
export type AgentSourcesResult = z.infer<typeof agentSourcesResult>;
