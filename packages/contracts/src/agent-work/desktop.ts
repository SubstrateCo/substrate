import type { AgentWorkMethods } from "./ipc.ts";

export { channel as agentWorkChannel } from "./ipc.ts";
export const agentWorkChangeChannel = "substrate:agent-work:change";
/** The most events one turnEvents call returns. A full page means more may follow. */
export const turnEventsPageSize = 1000;

/**
 * One attempt of a server turn that this desktop ran: the input it sent the harness. The
 * server's turn summary has everything else.
 */
export interface AgentTurnRunView {
  turnId: string;
  attempt: number;
  sessionId: string;
  userAgentId: string;
  /** The local epoch of the native session the attempt ran in. */
  epoch: number;
  envelope: string;
  /** The SHA-256 of the managed prefix, to compare prefixes across turns. */
  prefixHash: string;
  /** Transcript events of this attempt. */
  eventCount: number;
  createdAt: string;
}

/** An agent whose home is this desktop, while agent work runs here. */
export interface AgentHomedHere {
  userAgentId: string;
  /** Server turns this desktop runs for the agent now. */
  liveTurnIds: string[];
}

/** A hint that local transcripts or homed agents changed. It carries IDs only. */
export interface AgentWorkChange {
  userAgentId?: string;
  turnId?: string;
}

/** Main derives the account and organization for every call, like the harness bridge. */
export interface AgentWorkAPI extends AgentWorkMethods {
  onChange(callback: (change: AgentWorkChange) => void): () => void;
}
