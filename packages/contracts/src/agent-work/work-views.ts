import type { TurnPlace } from "../agent-tools/turn-context.ts";
import type { TurnKind, Usage } from "../harness-runtime/runtime.ts";
import type { AgentRequestView } from "./request-views.ts";
import type {
  AgentSessionResetReason,
  AgentSessionStatus,
  HelperStatus,
  InboxLane,
  InboxSource,
  InboxSourceRef,
  InboxStatus,
  TurnAttentionReason,
  TurnInterruption,
  TurnOutcome,
  TurnOutputView,
  TurnSourceMessage,
  TurnStatus,
} from "./turns.ts";
import type { AgentSessionKind } from "./wakes.ts";

export interface AgentWorkSessionView {
  id: string;
  userAgentId: string;
  /** Null when the place is hidden: the key names the conversation or thread. */
  key: string | null;
  kind: AgentSessionKind;
  parentSessionId: string | null;
  origin: TurnPlace | null;
  destination: TurnPlace | null;
  status: AgentSessionStatus;
  /** Grows each time the owner starts the session fresh or starts a new topic. */
  resetGeneration: number;
  resetReason: AgentSessionResetReason | null;
  placeVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentWorkTurnView {
  id: string;
  sessionId: string;
  userAgentId: string;
  sessionKind: AgentSessionKind;
  kind: TurnKind;
  status: TurnStatus;
  outcome: TurnOutcome | null;
  attempt: number;
  generation: number;
  /** The epoch handoff turn of its session. */
  handoff: boolean;
  itemIds: string[];
  /** What the turn published: messages, requests and tasks the owner can still see. */
  outputs: TurnOutputView[];
  sourceMessages: TurnSourceMessage[];
  /** Placement for answer and approval turns: the anchors of the requests they answer. */
  requestAnchors: { requestId: string; anchorMessageId: string | null }[];
  /** Placement for recovery turns: the turn this one resumes. */
  resumesTurnId: string | null;
  activity: string | null;
  error: string | null;
  attentionReason: TurnAttentionReason | null;
  interruption: TurnInterruption | null;
  usage: Usage | null;
  placeVisible: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AgentWorkItemView {
  id: string;
  sessionId: string;
  turnId: string | null;
  source: InboxSource;
  /** Null when the place is hidden. */
  sourceRef: InboxSourceRef | null;
  lane: InboxLane;
  status: InboxStatus;
  /** An owner item waiting for a busy slot. The owner can send it now. */
  held: boolean;
  /** Sent into a live turn with steer. */
  steered: boolean;
  /** Why an item was dropped, such as source_inaccessible. */
  reason: string | null;
  availableAt: string;
  createdAt: string;
}

export interface AgentWorkHelperView {
  id: string;
  parentSessionId: string;
  sessionId: string;
  userAgentId: string;
  /** Null when the parent session's place is hidden. */
  task: string | null;
  report: string | null;
  status: HelperStatus;
  createdAt: string;
  finishedAt: string | null;
}

/** GET /agent-work/agents/:id/activity: one page of an agent's turns, newest first. */
export interface AgentActivityView {
  /** The agent's sessions and helpers. Only the first page carries them. */
  sessions: AgentWorkSessionView[];
  helpers: AgentWorkHelperView[];
  turns: AgentWorkTurnView[];
  nextCursor: string | null;
}

/** GET /agent-work/conversations/:id/work: the owner's agent work in one conversation. */
export interface AgentConversationWorkView {
  conversationId: string;
  /** Sessions that come from or post to this conversation. */
  sessions: AgentWorkSessionView[];
  /** Their latest turns, newest first. */
  turns: AgentWorkTurnView[];
  /** Items not yet in a finished turn: pending, held, submitted and uncertain. */
  items: AgentWorkItemView[];
  /** The owner's requests that come from or post to this conversation. */
  requests: AgentRequestView[];
}

/** POST /agent-work/turns/:id/stop|retry|dismiss|start-fresh: the turn after the command. */
export interface AgentTurnCommandResult {
  turn: AgentWorkTurnView;
}

/** POST /agent-work/items/:id/send-now|resend|discard: the item after the command. */
export interface AgentItemCommandResult {
  item: AgentWorkItemView;
  /** Send now: the live turn it interrupts, so that the item runs next. */
  interruptedTurnId: string | null;
}

/** POST /agent-work/conversations/:id/new-topic: the DM sessions that start fresh. */
export interface AgentNewTopicResult {
  sessionIds: string[];
}
