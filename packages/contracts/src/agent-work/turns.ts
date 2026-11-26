import type { HarnessKind } from "../harness/kinds.ts";
import type { Usage } from "../harness/runtime.ts";
import type { TurnKind, TurnPlace } from "../harness/turn-context.ts";
import type { AgentRequestKind } from "./requests.ts";
import type { AgentSessionKind, AgentWakeRequestDetail } from "./wakes.ts";

// Local agent-work state on the home desktop, as the bridge returns it. Nothing here is on the server.

export const agentSessionStatuses = ["idle", "working", "closed"] as const;
export type AgentSessionStatus = (typeof agentSessionStatuses)[number];

export interface AgentSessionView {
  id: string;
  userAgentId: string;
  key: string;
  kind: AgentSessionKind;
  parentSessionId: string | null;
  origin: TurnPlace | null;
  destination: TurnPlace | null;
  harness: HarnessKind;
  epoch: number;
  status: AgentSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export const inboxSources = [
  "owner_message",
  "answer",
  "routine",
  /** In a helper's own session: its task, or more instructions from its parent agent. */
  "helper_task",
  /** In the parent's session: a helper's report. */
  "helper_result",
  "recovery",
  "epoch",
  /** A message from a person the owner allows to call the agent. */
  "caller_message",
  /** A batch of thread messages for one existing turn. Never starts a turn. */
  "thread_context",
] as const;
export type InboxSource = (typeof inboxSources)[number];

/** Claim order. Background items move up one lane for every inboxLaneAgingMs they wait. */
export const inboxLanes = ["owner", "caller", "system", "background"] as const;
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
  | {
      source: "caller_message";
      /** The server's invocation. The source check rechecks it before the turn runs. */
      invocationId: string;
      messageId: string;
      conversationId: string;
      threadId: string | null;
    }
  | {
      source: "answer";
      requestId: string;
      anchorMessageId: string | null;
      /** The decided request as the server reported it. Null when it was not available. */
      request: AgentWakeRequestDetail | null;
    }
  | { source: "routine"; routineId: string; revision: number; scheduledAt: string }
  | { source: "helper_task" | "helper_result"; helperId: string }
  | { source: "recovery"; turnId: string }
  | { source: "epoch"; fromEpoch: number };

export interface AgentInboxItemView {
  id: string;
  sessionId: string;
  source: InboxSource;
  sourceRef: InboxSourceRef;
  lane: InboxLane;
  status: InboxStatus;
  /** An owner item waiting for a busy slot. The UI offers "Send now". */
  held: boolean;
  /** Why an item was dropped, such as source_inaccessible. */
  reason: string | null;
  turnId: string | null;
  availableAt: string;
  createdAt: string;
}

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

export const turnOutcomes = ["replied", "silent", "asked"] as const;
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

export interface AgentTurnView {
  id: string;
  sessionId: string;
  userAgentId: string;
  sessionKind: AgentSessionKind;
  kind: TurnKind;
  status: TurnStatus;
  outcome: TurnOutcome | null;
  attempt: number;
  generation: number;
  itemIds: string[];
  /** Placement: the latest message output wins, then the newest source message. */
  outputs: TurnOutputView[];
  sourceMessages: TurnSourceMessage[];
  /** Placement for answer and approval turns: the anchors of the requests they answer. */
  requestAnchors: { requestId: string; anchorMessageId: string | null }[];
  /** Placement for recovery turns: the turn this one resumes. */
  resumesTurnId: string | null;
  /** The latest activity line, for the work line. */
  activity: string | null;
  error: string | null;
  attentionReason: TurnAttentionReason | null;
  usage: Usage | null;
  eventCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
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

export interface AgentHelperView {
  id: string;
  parentSessionId: string;
  sessionId: string;
  userAgentId: string;
  task: string;
  status: HelperStatus;
  report: string | null;
  createdAt: string;
  finishedAt: string | null;
}
