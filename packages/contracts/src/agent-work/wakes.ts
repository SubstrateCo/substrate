import { agentRequestResponse } from "../harness-runtime/requests.ts";
import { conversationKind } from "../messaging/input.ts";
import { proposalOutcome } from "./proposals.ts";
import { agentRequestKinds, agentRequestPayload, agentRequestStatuses } from "./requests.ts";
import { z } from "zod";

const id = z.uuid();

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

/** The slot a session's turns run in. One live turn per folder. */
export const folderKeys = {
  main: (userAgentId: string) => `main:${userAgentId}`,
  /** A helper's folder key is its session key. */
  helper: sessionKeys.helper,
};

/** Unique per agent, so a repeated event never creates a second work item. */
export const wakeDedupeKeys = {
  message: (messageId: string) => `msg:${messageId}`,
  answer: (requestId: string) => `answer:${requestId}`,
  approval: (requestId: string) => `approval:${requestId}`,
  /** Passive thread messages for one live turn, keyed by the first message of the batch. */
  threadContext: (turnId: string, messageId: string) => `thread-context:${turnId}:${messageId}`,
  routine: (routineId: string, revision: number, scheduledAt: string) =>
    `${sessionKeys.routine(routineId)}:${revision}:${scheduledAt}`,
  helperTask: (helperId: string) => `${sessionKeys.helper(helperId)}:task`,
  /** Unique for every message, because the parent may send the same text again. */
  helperMessage: (helperId: string) =>
    `${sessionKeys.helper(helperId)}:message:${crypto.randomUUID()}`,
  helperResult: (helperId: string) => `${sessionKeys.helper(helperId)}:result`,
  recovery: (turnId: string, attempt: number) => `recovery:${turnId}:${attempt}`,
  epoch: (sessionId: string, epoch: number) => `epoch:${sessionId}:${epoch}`,
};

/**
 * The decided request behind an answer or approval_result item, for the agent's own home device:
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

/** A server ID in a response. The desktop does not check its format. */
const ref = z.string().min(1);

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
});
export type AgentSourcesResult = z.infer<typeof agentSourcesResult>;
