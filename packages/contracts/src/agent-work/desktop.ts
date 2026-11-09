import type { HarnessKind } from "../harness/kinds.ts";
import type {
  AgentRoutineView,
  ApproveRoutineInput,
  CreateRoutineInput,
  UpdateRoutineInput,
} from "./routines.ts";
import type { AgentStatusState } from "./status.ts";
import type {
  AgentHelperView,
  AgentInboxItemView,
  AgentSessionView,
  AgentTurnView,
  TurnEventView,
} from "./turns.ts";

export const agentWorkChannel = "startup-os:agent-work";
export const agentWorkChangeChannel = "startup-os:agent-work:change";

/** Local work in one conversation, for agents homed on this desktop. */
export interface AgentConversationWork {
  conversationId: string;
  sessions: AgentSessionView[];
  turns: AgentTurnView[];
  /** Items not yet in a finished turn: pending, held, submitted and uncertain. */
  items: AgentInboxItemView[];
}

/** An agent that runs on this desktop. */
export interface AgentLocalSummary {
  userAgentId: string;
  harness: HarnessKind;
  state: AgentStatusState;
  liveTurnIds: string[];
  queuedCount: number;
  needsAttentionTurnIds: string[];
}

export interface AgentActivityPage {
  sessions: AgentSessionView[];
  turns: AgentTurnView[];
  helpers: AgentHelperView[];
  nextCursor: string | null;
}

/** A hint that local agent work changed. It carries IDs only; refetch what it names. */
export interface AgentWorkChange {
  userAgentId?: string;
  conversationId?: string;
  turnId?: string;
}

/** Main derives the account and organization for every call, like the harness bridge. */
export interface AgentWorkAPI {
  conversation(conversationId: string): Promise<AgentConversationWork>;
  /** One turn on this desktop, for transcript links. Null when this desktop does not have it. */
  turn(turnId: string): Promise<AgentTurnView | null>;
  /** Events with seq greater than after, oldest first. */
  turnEvents(turnId: string, after?: number): Promise<TurnEventView[]>;
  agents(): Promise<AgentLocalSummary[]>;
  agentActivity(agentId: string, cursor?: string): Promise<AgentActivityPage>;
  /** Interrupts the live turn in the item's slot so the held item runs next. */
  sendNow(itemId: string): Promise<void>;
  /** For uncertain items: sends the item again in the next turn of its session. */
  resendItem(itemId: string): Promise<void>;
  /** For uncertain items: the item needs nothing more. */
  discardItem(itemId: string): Promise<void>;
  stop(turnId: string): Promise<void>;
  /** For needs_attention turns. */
  retry(turnId: string): Promise<void>;
  dismiss(turnId: string): Promise<void>;
  /** Rotates the session's epoch instead of resuming the native session. */
  startFresh(turnId: string): Promise<void>;
  /** Starts a new epoch for the DM session of this conversation. */
  newTopic(conversationId: string): Promise<void>;
  routines: {
    list(agentId: string): Promise<AgentRoutineView[]>;
    create(input: CreateRoutineInput): Promise<AgentRoutineView>;
    update(input: UpdateRoutineInput): Promise<AgentRoutineView>;
    approve(input: ApproveRoutineInput): Promise<AgentRoutineView>;
    delete(routineId: string): Promise<void>;
  };
  onChange(callback: (change: AgentWorkChange) => void): () => void;
}

declare global {
  interface Window {
    readonly startupOSAgentWork?: AgentWorkAPI;
  }
}
