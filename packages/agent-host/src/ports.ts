import type { AgentWorkStore } from "@substrate/client-storage/agent-work";
import type { McpInput, McpOutput } from "@substrate/contracts/agent-tools/tools";
import type {
  AgentRequestDelivery,
  AgentSourcesResult,
  CloseRequestStatus,
  openRequestInput,
  TurnStatus,
} from "@substrate/contracts/agent-work";
import type {
  HostFinishInput,
  HostFinishResult,
  HostProgressInput,
  HostSteerResult,
  HostTurn,
  RecoveryDecision,
} from "@substrate/contracts/agent-work/control";
import type { AgentWorkChange } from "@substrate/contracts/agent-work/desktop";
import type { AgentOptionalAppId } from "@substrate/contracts/agents";
import type { AppId } from "@substrate/contracts/apps";
import type {
  HarnessCommand,
  HarnessCommandResult,
  harnessKinds,
} from "@substrate/contracts/harness-runtime";

import type { AgentRequestState, ThreadMessage } from "./server/agent-work-server.ts";
import type { z } from "zod";

/*
 * The ports of the agent host. A host process, such as the Electron desktop or a cloud sandbox,
 * implements them and passes them to `createAgentWorkRuntime`.
 */

type Body<T> = Omit<T, "organizationId" | "installationId">;
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type HostFinish = Optional<
  Body<HostFinishInput>,
  | "outcome"
  | "error"
  | "attentionReason"
  | "interruption"
  | "consumedItemIds"
  | "stillQueuedItemIds"
  | "usage"
>;
export type HostProgress = Optional<Body<HostProgressInput>, "consumedItemIds">;
export type SteerReport = "delivered" | "undelivered" | "uncertain" | "inaccessible";

/**
 * The server's control plane, as this host uses it. The server owns the queue and every turn's
 * lifecycle; the host claims turns, runs them and reports what happened. Each call is scoped to
 * one organization.
 */
export interface HostApi {
  /** Claims queued work into free slots. busyFolders are held here without a live turn. */
  claim(organizationId: string, busyFolders: string[]): Promise<HostTurn[]>;
  /** This device's live turns, including those the owner stopped. */
  sync(organizationId: string): Promise<HostTurn[]>;
  start(
    organizationId: string,
    turnId: string,
    input: { attempt: number; droppedItemIds: string[] },
  ): Promise<TurnStatus>;
  progress(organizationId: string, turnId: string, input: HostProgress): Promise<TurnStatus>;
  finish(organizationId: string, turnId: string, input: HostFinish): Promise<HostFinishResult>;
  retryLater(
    organizationId: string,
    turnId: string,
    input: { attempt: number; delayMs: number },
  ): Promise<"requeued" | "kept">;
  recover(
    organizationId: string,
    turnId: string,
    input: { attempt: number; unfinishedTool: boolean },
  ): Promise<RecoveryDecision>;
  steer(
    organizationId: string,
    turnId: string,
    input: { attempt: number; harnessCanSteer: boolean; awaitingRequestIds: string[] },
  ): Promise<HostSteerResult>;
  steerResult(
    organizationId: string,
    itemId: string,
    input: { turnId: string; result: SteerReport },
  ): Promise<void>;
  /** Submits the epoch handoff of a session. Returns whether a new item was created. */
  submitEpoch(
    organizationId: string,
    input: { sessionId: string; fromEpoch: number; body: string },
  ): Promise<boolean>;
}

export interface CatalogAgent {
  id: string;
  name: string;
  harness: (typeof harnessKinds)[number];
  enabled: boolean;
  /** Enabled apps whose Substrate skill and tools the agent does not get. */
  disabledApps: AgentOptionalAppId[];
  /** The agent's home device is this host. Only home agents run here. */
  home: boolean;
}

/** The home device's calls to the server. The session decides the user. */
export interface AgentWorkServer {
  register(input: { name: string; platform: string }): Promise<void>;
  /** Marks this device as seen and renews the leases of its live turns. */
  heartbeat(): Promise<void>;
  catalog(): Promise<CatalogAgent[]>;
  sources(organizationId: string, messageIds: string[]): Promise<AgentSourcesResult>;
  threadMessages(
    organizationId: string,
    conversationId: string,
    threadId: string,
    beforeMessageId?: string,
  ): Promise<ThreadMessage[]>;
  openRequest(
    input: Omit<z.input<typeof openRequestInput>, "installationId">,
  ): Promise<{ id: string; status: string }>;
  closeRequest(
    organizationId: string,
    requestId: string,
    status: CloseRequestStatus,
  ): Promise<void>;
  requestAnswers(organizationId: string): Promise<AgentRequestDelivery[]>;
  /** A request's status and outcome, such as a proposal that a held tool call waits on. */
  requestStatus(organizationId: string, requestId: string): Promise<AgentRequestState>;
}

/** The harness controller, as the runtime uses it. The host checks account and organization. */
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
}

/**
 * The local execution store: native sessions and epochs, turn attempts, transcripts, handoffs,
 * MCP servers and working folders. `AgentWorkStore` from `@substrate/client-storage/agent-work` implements it.
 */
export type HostStore = Pick<
  AgentWorkStore,
  "nativeSessions" | "turnRuns" | "events" | "handoffs" | "mcpServers" | "workspaces"
>;

/** The owner's agents from the server catalog, cached. */
export interface AgentDirectory {
  get(userAgentId: string): Promise<CatalogAgent | undefined>;
  all(): Promise<CatalogAgent[]>;
  /** The next read fetches the catalog again. */
  invalidate(): void;
}

/** The owner's mail, bound to the verified account and organization by the host. */
export interface AgentInbox {
  search(q: McpInput<"search_inbox">): Promise<McpOutput<"search_inbox">>;
  read(q: McpInput<"read_inbox_message">): Promise<McpOutput<"read_inbox_message">>;
}

/** What this host can offer beyond the server. Each capability is optional. */
export interface HostCapabilities {
  /** The workspace apps enabled for the organization. */
  enabledApps?(): Promise<readonly AppId[]>;
  /** The owner's private inbox. Without it, inbox tools fail as unavailable. */
  inbox?: AgentInbox;
}

export interface Clock {
  now(): number;
}

export interface RuntimeTimers {
  every(callback: () => void, milliseconds: number): () => void;
  later(callback: () => void, milliseconds: number): () => void;
}

export interface Logger {
  log(message: string): void;
}

/** Tells the host's views that agent work changed, such as the desktop renderer. */
export interface ChangeSink {
  notify(change: AgentWorkChange): void;
}

/**
 * Where a realtime hint source pushes its hints. Without one, the host cycle still runs on its
 * 30 s polling interval.
 */
export interface HostHints {
  /** An agent-work hint: a burst within the hint window runs one cycle. */
  hint(): void;
  /** A reconnect, or a session or app change: run the cycle and deliver answers at once. */
  sync(): Promise<void>;
  /** Agents changed, or hints may have been missed: the next turn synchronizes the harness. */
  agentsChanged(): void;
}
