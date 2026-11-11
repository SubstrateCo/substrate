import type { HarnessKind } from "../harness/kinds.ts";
import type { AgentWorkMethods } from "./ipc.ts";
import type { AgentStatusState } from "./status.ts";
import type {
  AgentHelperView,
  AgentInboxItemView,
  AgentSessionView,
  AgentTurnView,
} from "./turns.ts";

export { channel as agentWorkChannel } from "./ipc.ts";
export const agentWorkChangeChannel = "substrate:agent-work:change";
/** The most events one turnEvents call returns. A full page means more may follow. */
export const turnEventsPageSize = 1000;

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
export interface AgentWorkAPI extends AgentWorkMethods {
  onChange(callback: (change: AgentWorkChange) => void): () => void;
}
