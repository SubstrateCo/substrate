import type { TurnInterruption, TurnSourceMessage } from "@substrate/contracts/agent-work";
import type { HostItem, HostSession } from "@substrate/contracts/agent-work/control";
import type { AgentWorkChange } from "@substrate/contracts/agent-work/desktop";
import type {
  AdapterCapabilities,
  HarnessKind,
  TurnKind,
  Usage,
} from "@substrate/contracts/harness-runtime";

import type {
  AgentDirectory,
  AgentWorkServer,
  Clock,
  HarnessPort,
  HostApi,
  HostCapabilities,
  HostStore,
  Logger,
} from "../ports.ts";

/** Everything the runtime modules share. One context per account and active organization. */
export interface RuntimeContext extends HostCapabilities, Clock, Logger {
  organizationId: string;
  /** Local native sessions, turn attempts, transcripts and handoffs. */
  store: HostStore;
  /** Device calls: sources, requests and registration. */
  server: AgentWorkServer;
  /** The server's control plane: claim, run and report turns. */
  host: HostApi;
  harness: HarnessPort;
  agents: AgentDirectory;
  /** Work changed in a way that may free a slot or end a turn: tell the renderer, and run the host cycle. */
  changed(change: AgentWorkChange): void;
  /** A live turn's transcript grew, such as with a tool start: tell the renderer only. */
  progressed(change: AgentWorkChange): void;
  /** Runs callback once after milliseconds, unless the runtime stopped. Returns a cancel. */
  later(callback: () => void, milliseconds: number): () => void;
}

/** What a turn published, as its MCP calls returned it. */
export type TurnOutput =
  | { kind: "message"; id: string; conversationId: string; threadId: string | null }
  | { kind: "task"; id: string }
  | { kind: "request"; id: string; requestKind: "question" | "proposal" };

/** A server turn this process is running. The server row is the source of truth. */
export interface LiveTurn {
  turnId: string;
  sessionId: string;
  userAgentId: string;
  session: HostSession;
  folderKey: string;
  harness: HarnessKind;
  kind: TurnKind;
  /** Set only from rechecked owner-authored source messages in this agent's DM. */
  ownerDm: boolean;
  attempt: number;
  generation: number;
  /** The local epoch of the native session. */
  epoch: number;
  handoff: boolean;
  autoContinue: boolean;
  startedAt: number;
  capabilities: AdapterCapabilities;
  /** The batch the turn started with. */
  items: HostItem[];
  /** Items steered into the turn. */
  steered: Set<string>;
  /** Items the harness reported as read. */
  consumed: Set<string>;
  /** Steered inputs an interrupt receipt reported as still queued. */
  stillQueued: string[];
  /** Requests that a held tool call of this turn waits on. Their decisions do not steer in. */
  awaitingApprovals: Set<string>;
  /** Proposals whose decision a held tool call already returned in this turn. */
  decided: Set<string>;
  /**
   * Why this turn is ending, recorded before the native session closes, so that the close ends
   * it as cancelled or interrupted. Null while nothing asked it to end.
   */
  stopping: TurnInterruption | null;
  /** The server no longer holds the turn for this device: nothing more is reported. */
  released: boolean;
  /** The turn was told to wrap up. */
  wrappedUp: boolean;
  usage: Usage | null;
  /** The latest tool start. */
  activity: string | null;
  conversationId: string | null;
  threadId: string | null;
  sourceMessages: TurnSourceMessage[];
  outputs: TurnOutput[];
  /** The agent wrote text outside tools in this turn. Only reply shows text to the owner. */
  wroteText: boolean;
  /** The turn was asked once to send its unsent answer. */
  nudged: boolean;
  /** Events of this turn are handled one at a time, in order. */
  chain: Promise<void>;
}
