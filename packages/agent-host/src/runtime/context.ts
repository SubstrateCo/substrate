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

export interface RuntimeContext extends HostCapabilities, Clock, Logger {
  organizationId: string;
  store: HostStore;
  server: AgentWorkServer;
  host: HostApi;
  harness: HarnessPort;
  agents: AgentDirectory;
  changed(change: AgentWorkChange): void;
  progressed(change: AgentWorkChange): void;
  later(callback: () => void, milliseconds: number): () => void;
}

export type TurnOutput =
  | { kind: "message"; id: string; conversationId: string; threadId: string | null }
  | { kind: "task"; id: string }
  | { kind: "request"; id: string; requestKind: "question" | "proposal" };

export interface LiveTurn {
  turnId: string;
  sessionId: string;
  userAgentId: string;
  session: HostSession;
  folderKey: string;
  harness: HarnessKind;
  kind: TurnKind;
  ownerDm: boolean;
  attempt: number;
  generation: number;
  epoch: number;
  handoff: boolean;
  autoContinue: boolean;
  startedAt: number;
  capabilities: AdapterCapabilities;
  items: HostItem[];
  steered: Set<string>;
  consumed: Set<string>;
  stillQueued: string[];
  awaitingApprovals: Set<string>;
  decided: Set<string>;
  stopping: TurnInterruption | null;
  released: boolean;
  wrappedUp: boolean;
  usage: Usage | null;
  activity: string | null;
  conversationId: string | null;
  threadId: string | null;
  sourceMessages: TurnSourceMessage[];
  outputs: TurnOutput[];
  wroteText: boolean;
  nudged: boolean;
  chain: Promise<void>;
}
