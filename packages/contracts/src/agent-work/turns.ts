import type { Usage } from "../harness-runtime/runtime.ts";
import type { AgentRequestKind } from "./requests.ts";

export const agentSessionStatuses = ["idle", "working", "closed"] as const;
export type AgentSessionStatus = (typeof agentSessionStatuses)[number];

/**
 * Why the owner reset a session's context. The host opens a fresh native session before the
 * session's next turn when its reset generation grew.
 */
export const agentSessionResetReasons = ["new_topic", "start_fresh"] as const;
export type AgentSessionResetReason = (typeof agentSessionResetReasons)[number];

export const inboxSources = [
  "owner_message",
  "answer",
  "approval_result",
  "routine",
  /** In a helper's own session: its task, or more instructions from its parent agent. */
  "helper_task",
  /** In the parent's session: a helper's report. */
  "helper_result",
  "recovery",
  "epoch",
  /** A batch of thread messages for one existing turn. Never starts a turn. */
  "thread_context",
] as const;
export type InboxSource = (typeof inboxSources)[number];

/** Claim order. Background items move up one lane for every inboxLaneAgingMs they wait. */
export const inboxLanes = ["owner", "system", "background"] as const;
export const inboxLaneAgingMs = 10 * 60_000;
export type InboxLane = (typeof inboxLanes)[number];

export const inboxStatuses = [
  "pending",
  "submitted",
  "consumed",
  "confirmed_unconsumed",
  "uncertain",
  "dropped",
  "superseded",
  "expired",
] as const;
export type InboxStatus = (typeof inboxStatuses)[number];

export type InboxSourceRef =
  | {
      source: "thread_context";
      messageIds: string[];
      targetTurnId: string;
      conversationId: string;
      threadId: string;
    }
  | { source: "owner_message"; messageId: string; conversationId: string; threadId: string | null }
  | { source: "answer" | "approval_result"; requestId: string; anchorMessageId: string | null }
  | { source: "routine"; routineId: string; revision: number; scheduledAt: string }
  | { source: "helper_task" | "helper_result"; helperId: string }
  | { source: "recovery"; turnId: string }
  | { source: "epoch"; fromEpoch: number };

export const turnStatuses = [
  "assigned",
  "running",
  "waiting",
  "stopping",
  "completed",
  "cancelled",
  "interrupted",
  "needs_attention",
  "failed",
] as const;
export type TurnStatus = (typeof turnStatuses)[number];
export const liveTurnStatuses: readonly TurnStatus[] = [
  "assigned",
  "running",
  "waiting",
  "stopping",
];

/**
 * Who ended a live turn early. owner: Send now interrupted it. stop: the owner stopped it. app:
 * the host closed while it ran. budget: it ran too long. retire: the host switched organization
 * or account. moved: the agent moved to another device.
 */
export const turnInterruptions = ["owner", "stop", "app", "budget", "retire", "moved"] as const;
export type TurnInterruption = (typeof turnInterruptions)[number];

export const turnOutcomes = ["replied", "silent", "asked", "proposed"] as const;
export type TurnOutcome = (typeof turnOutcomes)[number];

export const turnAttentionReasons = [
  "unfinished_tool",
  "uncertain_input",
  "resume_failed",
  "interrupted_again",
  "failed",
] as const;
export type TurnAttentionReason = (typeof turnAttentionReasons)[number];

export type TurnOutputView =
  | {
      kind: "message";
      id: string;
      conversationId: string;
      threadId: string | null;
      createdAt: string;
    }
  | { kind: "task"; id: string; createdAt: string }
  | { kind: "request"; id: string; createdAt: string };

/** A source message of the turn that the owner could see when the turn was claimed. */
export interface TurnSourceMessage {
  messageId: string;
  conversationId: string;
  threadId: string | null;
  createdAt: string;
}

/** Data for each turn event kind. */
export interface TurnEventData {
  turn_started: Record<string, never>;
  text: { text: string };
  activity: { text: string };
  tool_started: { itemType: string; title: string };
  tool_completed: { status: "completed" | "failed" };
  request: { requestId: string; kind: AgentRequestKind };
  request_resolved: { requestId: string };
  input_submitted: { inputId: string };
  input_consumed: { inputId: string };
  output: TurnOutputView;
  usage: { usage: Usage };
  note: { text: string };
  error: { code: string; message: string };
  turn_finished: { status: TurnStatus; outcome: TurnOutcome | null };
}
export type TurnEventKind = keyof TurnEventData;

export type TurnEventView = {
  [K in TurnEventKind]: {
    turnId: string;
    seq: number;
    attempt: number;
    kind: K;
    /** The native tool or message item, for tool events. */
    itemId: string | null;
    data: TurnEventData[K];
    createdAt: string;
  };
}[TurnEventKind];

export const helperStatuses = ["running", "finished", "failed", "stopped"] as const;
export type HelperStatus = (typeof helperStatuses)[number];
/** Live helpers per agent. */
export const maxLiveHelpers = 2;
