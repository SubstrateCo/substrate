import type { AgentWorkStore } from "@substrate/client-storage/agent-work";
import type { AgentWorkChange } from "@substrate/contracts/agent-work/desktop";
import type { AppId } from "@substrate/contracts/apps";
import type {
  AdapterCapabilities,
  HarnessCommand,
  HarnessCommandResult,
  HarnessKind,
  TurnKind,
  Usage,
} from "@substrate/contracts/harness";

import type { AgentInbox } from "../../mail/agent/agent-access.ts";
import type { AgentWorkServer, CatalogAgent } from "../server/agent-work-server.ts";

/** The harness controller, as the runtime uses it. Main checks account and organization. */
export interface HarnessPort {
  /** Writes current agent folders before sessions open. */
  synchronize(): Promise<void>;
  /** The controller parses each result before it returns it. */
  execute<C extends HarnessCommand>(command: C): Promise<HarnessCommandResult<C>>;
  /**
   * Interrupts and closes every native session of the organization, also when the controller
   * already verified another one. Each live turn ends, then its session.closed event follows.
   */
  closeOrganization(organizationId: string): Promise<void>;
  /** memory/profile.md of an agent in the active organization. */
  readProfile(agentId: string): Promise<string>;
}

/** The owner's agents from the server catalog, cached. */
export interface AgentDirectory {
  get(userAgentId: string): Promise<CatalogAgent | undefined>;
  all(): Promise<CatalogAgent[]>;
  /** The next read fetches the catalog again. */
  invalidate(): void;
}

/** Everything the runtime modules share. One context per account and active organization. */
export interface RuntimeContext {
  organizationId: string;
  /** This desktop. The server accepts write tools only from the agent's home device. */
  installationId: string;
  store: AgentWorkStore;
  server: AgentWorkServer;
  harness: HarnessPort;
  agents: AgentDirectory;
  /** memory/profile.md of the agent folder, or empty. */
  profile(agentId: string): Promise<string>;
  enabledApps?(): Promise<readonly AppId[]>;
  inbox?: AgentInbox;
  now(): number;
  log(message: string): void;
  /** Local work changed: tell the renderer, publish status, and run the claim loop. */
  changed(change: AgentWorkChange): void;
  /**
   * A live turn progressed in a way that cannot make work claimable, such as a tool start:
   * tell the renderer and publish status, without the claim loop.
   */
  progressed(change: AgentWorkChange): void;
  /** Runs callback once after milliseconds, unless the runtime stopped. Returns a cancel. */
  later(callback: () => void, milliseconds: number): () => void;
}

/** A turn this process is running. The row in the store is the source of truth. */
export interface LiveTurn {
  turnId: string;
  sessionId: string;
  userAgentId: string;
  folderKey: string;
  harness: HarnessKind;
  kind: TurnKind;
  /** Set only from rechecked owner-authored source messages in this agent's DM. */
  ownerDm: boolean;
  attempt: number;
  generation: number;
  epoch: number;
  handoff: boolean;
  startedAt: number;
  capabilities: AdapterCapabilities;
  /** Steered inputs an interrupt receipt reported as still queued. */
  stillQueued: string[];
  /** Calls already attached to the turn's MCP context, including steered calls. */
  invocationIds: string[];
  /** Requests that a held tool call of this turn waits on. Their decisions do not steer in. */
  awaitingApprovals: Set<string>;
  usage: Usage | null;
  /** The latest tool start, for status. */
  activity: string | null;
  conversationId: string | null;
  threadId: string | null;
  /** Events of this turn are handled one at a time, in order. */
  chain: Promise<void>;
}
