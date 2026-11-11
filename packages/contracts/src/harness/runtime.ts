import type { HarnessConfiguration } from "./agent.ts";
import { harnessKinds, type HarnessKind } from "./kinds.ts";
import type {
  HarnessInspection,
  HarnessLocalConfiguration,
  HarnessMcpServer,
  HarnessSkill,
} from "./local.ts";
import type { HarnessModelCatalog } from "./models.ts";
import type { TurnContext, TurnKind } from "./turn-context.ts";
import { z } from "zod";

export interface HarnessLocalScope {
  organizationId: string;
  agentId: string;
  harness: HarnessKind;
}

/** What a native harness proved it supports. Anything unproven is false. */
export const adapterCapabilitiesSchema = z.object({
  /** New input can join a live turn. */
  steer: z.boolean(),
  /** The harness reports when steered input was consumed. */
  steerEvidence: z.boolean(),
  compact: z.boolean(),
  usage: z.boolean(),
  /** A turn can run with every permission and question denied. */
  noAskProfile: z.boolean(),
  /** Interrupt reports which steered inputs were still queued. */
  interruptReceipt: z.boolean(),
});
export type AdapterCapabilities = z.infer<typeof adapterCapabilitiesSchema>;

/** Token counts as reported. contextUsed and contextWindow drive epoch rotation. */
export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  contextUsed?: number;
  contextWindow?: number;
}

export interface TurnInput {
  /** Local inbox item IDs batched into this input. */
  inputIds: string[];
  text: string;
}

export interface TurnResult {
  status: "completed" | "interrupted" | "failed";
  error?: string;
  consumedInputIds?: string[];
  usage?: Usage;
}

export interface InterruptReceipt {
  stillQueuedInputIds?: string[];
}

/** The main agent folder, or a helper's sibling folder. Each folder is one slot. */
export type HarnessFolder = "main" | { helperId: string };

/** A native session that the host keeps open for a local agent-work session. */
export const harnessSessionRefSchema = z.object({
  /** The local agent-work session ID. */
  id: z.string(),
  organizationId: z.string(),
  agentId: z.string(),
  harness: z.enum(harnessKinds),
  nativeSessionId: z.string(),
  folder: z.union([z.literal("main"), z.object({ helperId: z.string() })]),
  capabilities: adapterCapabilitiesSchema,
  /** False when a new native session started instead of resuming nativeSessionId. */
  resumed: z.boolean(),
});
export type HarnessSessionRef = z.infer<typeof harnessSessionRefSchema>;

interface SessionCommand {
  organizationId: string;
  /** The local agent-work session ID. */
  sessionId: string;
}

export type HarnessCommand =
  | (SessionCommand & {
      type: "open";
      agentId: string;
      folder: HarnessFolder;
      nativeSessionId?: string;
      /**
       * The local session's epoch. An open session of another epoch, or of another
       * nativeSessionId when one is given, is closed and replaced by a fresh one.
       */
      epoch: number;
      /** Fail with resume-failed instead of starting a new native session. */
      requireResume?: boolean;
      /** Managed policy prefix for this epoch. Byte-stable within an epoch. */
      prefix: string;
    })
  | (SessionCommand & {
      type: "turn";
      turnId: string;
      generation: number;
      mode: TurnKind;
      input: TurnInput;
      /** Attached to every MCP call made from this turn's lease. */
      context: TurnContext;
    })
  | (SessionCommand & { type: "steer"; turnId: string; inputId: string; text: string })
  /** Fails with no-live-turn when that turn is not live in the session. */
  | (SessionCommand & { type: "interrupt"; turnId: string })
  | (SessionCommand & { type: "respond"; requestId: string; response: unknown })
  | (SessionCommand & { type: "compact" })
  | (SessionCommand & { type: "close" });

/** turn and steer acknowledge at once; their outcome arrives as events. */
export interface HarnessCommandResults {
  open: HarnessSessionRef;
  turn: void;
  steer: void;
  interrupt: InterruptReceipt;
  respond: void;
  compact: void;
  close: void;
}
export type HarnessCommandResult<C extends HarnessCommand = HarnessCommand> =
  HarnessCommandResults[C["type"]];

/** Canonical events. Raw native payloads stay inside adapters, except request data. */
export type HarnessEventBody =
  | { type: "turn.started" }
  | { type: "turn.completed"; result: TurnResult }
  | { type: "text"; text: string }
  | { type: "item.started"; itemId: string; itemType: string; title: string }
  | { type: "item.completed"; itemId: string; status: "completed" | "failed" }
  | {
      type: "request.opened";
      requestId: string;
      kind: "permission" | "input";
      /** Native request data. normalizeHarnessRequest converts it for display. */
      data: unknown;
    }
  | { type: "input.consumed"; inputId: string }
  | { type: "usage.updated"; usage: Usage }
  | { type: "compaction" }
  | { type: "error"; code: string; message: string }
  | {
      type: "session.closed";
      /**
       * idle: the keep-alive reaper closed it. closed: a close command, a replacing open, or host
       * disposal. worker_exited: the harness process stopped; main emits this for every open
       * session, with that session's live turn, if any. configuration: the agent's
       * configuration changed; a session with a live turn closes after that turn ends.
       */
      reason: "idle" | "closed" | "worker_exited" | "configuration";
    };

export type HarnessEvent = {
  sessionId: string;
  organizationId: string;
  /** Null for native output outside any turn of ours, and for session events. */
  turnId: string | null;
  generation: number | null;
  timestamp: number;
} & HarnessEventBody;

export interface HarnessHost {
  listModels(
    scope: Omit<HarnessLocalScope, "agentId"> & { agentId?: string },
  ): Promise<HarnessModelCatalog>;
  configure(configuration: HarnessConfiguration): Promise<void>;
  scanConfiguration(scope: HarnessLocalScope): Promise<HarnessLocalConfiguration>;
  saveSkill(input: HarnessLocalScope & { skill: HarnessSkill }): Promise<void>;
  deleteSkill(input: HarnessLocalScope & { id: string }): Promise<void>;
  /** Overwrites the Substrate default instructions, profile, and skill files. Other files stay. */
  resetDefaults(scope: HarnessLocalScope): Promise<void>;
  saveMcpServer(input: HarnessLocalScope & { server: HarnessMcpServer }): Promise<void>;
  deleteMcpServer(input: HarnessLocalScope & { id: string }): Promise<void>;
  inspect(): Promise<HarnessInspection[]>;
  execute<C extends HarnessCommand>(command: C): Promise<HarnessCommandResult<C>>;
  subscribe(listener: (event: HarnessEvent) => void): () => void;
  dispose(): Promise<void>;
}
