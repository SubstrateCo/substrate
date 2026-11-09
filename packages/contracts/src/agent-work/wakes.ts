import { proposalOutcome } from "./proposals.ts";
import {
  agentRequestKinds,
  agentRequestPayload,
  agentRequestResponse,
  agentRequestStatuses,
} from "./requests.ts";
import { z } from "zod";

const id = z.uuid();

/** Owner-authorized server events that wake an agent. Nothing else wakes it from the server. */
export const agentWakeSources = ["owner_message", "answer", "approval_result"] as const;
export type AgentWakeSource = (typeof agentWakeSources)[number];

/** Why an owner message woke the agent. One wake per message: mention > DM > thread reply. */
export const agentWakeMessageKinds = ["direct_message", "mention", "thread_reply"] as const;
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

/** Unique per agent, so a repeated event never creates a second wake. */
export const wakeDedupeKeys = {
  message: (messageId: string) => `msg:${messageId}`,
  answer: (requestId: string) => `answer:${requestId}`,
  approval: (requestId: string) => `approval:${requestId}`,
};

/**
 * The decided request behind an answer or approval_result wake, for the agent's own home device:
 * what was asked or proposed, the owner's answer, and what happened.
 */
export const agentWakeRequestDetail = z.strictObject({
  id,
  kind: z.enum(agentRequestKinds),
  status: z.enum(agentRequestStatuses),
  /** Questions with their options, or the proposal summary. */
  payload: agentRequestPayload,
  /** The owner's answer to a question. Null for proposals. */
  response: agentRequestResponse.nullable(),
  /** Proposals only: declined, the executed receipt, or why it failed. */
  outcome: proposalOutcome.nullable(),
  anchorMessageId: id.nullable(),
  conversationId: id.nullable(),
  threadId: id.nullable(),
});
export type AgentWakeRequestDetail = z.infer<typeof agentWakeRequestDetail>;

export interface AgentWakeView {
  id: string;
  userAgentId: string;
  source: AgentWakeSource;
  sourceRef: AgentWakeSourceRef;
  sessionKey: string;
  dedupeKey: string;
  createdAt: string;
  /** Set for answer and approval_result wakes of the owner's own agent. */
  request: AgentWakeRequestDetail | null;
}

/** A message body for the home desktop, returned only while the owner can see the message. */
export interface AgentSourceMessage {
  id: string;
  conversationId: string;
  threadId: string | null;
  conversationName: string;
  conversationKind: "dm" | "group" | "channel";
  author: { actorId: string; name: string; kind: "owner" | "member" | "agent" };
  body: string;
  createdAt: string;
}

export interface AgentSourcesResult {
  messages: AgentSourceMessage[];
  /** Requested IDs that the owner cannot see now, or that do not exist. */
  inaccessible: string[];
}
