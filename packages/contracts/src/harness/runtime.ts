import type { HarnessConfiguration } from "./agent.ts";
import { harnessKinds, type HarnessKind } from "./kinds.ts";
import type { HarnessInspection, HarnessNativeConfiguration, HarnessSkill } from "./local.ts";
import { harnessIdSchema, harnessMcpServerSchema, maxHarnessMcpServers } from "./local.ts";
import type { HarnessModelCatalog } from "./models.ts";
import { turnContextSchema, turnKinds } from "./turn-context.ts";
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
const usageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
  contextUsed: z.number().optional(),
  contextWindow: z.number().optional(),
});
export type Usage = z.infer<typeof usageSchema>;

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
export const harnessFolderSchema = z.union([
  z.literal("main"),
  z.strictObject({ helperId: harnessIdSchema }),
]);
export type HarnessFolder = z.infer<typeof harnessFolderSchema>;

/** A native session that the host keeps open for a local agent-work session. */
export const harnessSessionRefSchema = z.object({
  /** The local agent-work session ID. */
  id: z.string(),
  organizationId: z.string(),
  agentId: z.string(),
  harness: z.enum(harnessKinds),
  nativeSessionId: z.string(),
  folder: harnessFolderSchema,
  capabilities: adapterCapabilitiesSchema,
  /** False when a new native session started instead of resuming nativeSessionId. */
  resumed: z.boolean(),
});
export type HarnessSessionRef = z.infer<typeof harnessSessionRefSchema>;

const session = { organizationId: harnessIdSchema, sessionId: z.string().min(1).max(200) };
const inputId = z.string().min(1).max(200);
const text = z.string().min(1).max(1_000_000);
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("open"),
    ...session,
    agentId: harnessIdSchema,
    folder: harnessFolderSchema,
    nativeSessionId: z.string().min(1).max(500).optional(),
    epoch: z.number().int().min(0),
    requireResume: z.boolean().optional(),
    prefix: z.string().max(100_000),
    /** The agent's user-added MCP servers, passed to the harness at session setup. */
    mcpServers: z.array(harnessMcpServerSchema).max(maxHarnessMcpServers),
  }),
  z.strictObject({
    type: z.literal("turn"),
    ...session,
    turnId: z.uuid(),
    generation: z.number().int().min(0),
    mode: z.enum(turnKinds),
    input: z.strictObject({ inputIds: z.array(inputId).min(1).max(64), text }),
    context: turnContextSchema,
  }),
  z.strictObject({
    type: z.literal("steer"),
    ...session,
    turnId: z.uuid(),
    inputId,
    text,
    invocationIds: z.array(z.uuid()).max(20).optional(),
  }),
  z.strictObject({ type: z.literal("interrupt"), ...session, turnId: z.uuid() }),
  z.strictObject({
    type: z.literal("respond"),
    ...session,
    requestId: z.string().min(1).max(500),
    response: z
      .json()
      .optional()
      .refine((value) => value === undefined || JSON.stringify(value).length <= 100000),
  }),
  z.strictObject({ type: z.literal("compact"), ...session }),
  z.strictObject({ type: z.literal("close"), ...session }),
]);
export type HarnessCommand = z.infer<typeof commandSchema>;

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
const harnessEventBodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("turn.started") }),
  z.object({
    type: z.literal("turn.completed"),
    result: z.object({
      status: z.enum(["completed", "interrupted", "failed"]),
      error: z.string().optional(),
      consumedInputIds: z.array(z.string()).optional(),
      usage: usageSchema.optional(),
    }),
  }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("item.started"),
    itemId: z.string(),
    itemType: z.string(),
    title: z.string(),
  }),
  z.object({
    type: z.literal("item.completed"),
    itemId: z.string(),
    status: z.enum(["completed", "failed"]),
  }),
  z.object({
    type: z.literal("request.opened"),
    requestId: z.string(),
    kind: z.enum(["permission", "input"]),
    data: z.unknown(),
  }),
  z.object({ type: z.literal("input.consumed"), inputId: z.string() }),
  z.object({ type: z.literal("usage.updated"), usage: usageSchema }),
  z.object({ type: z.literal("compaction") }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({
    type: z.literal("session.closed"),
    reason: z.enum(["idle", "closed", "worker_exited", "native_exited", "configuration"]),
  }),
]);
export type HarnessEventBody = z.infer<typeof harnessEventBodySchema>;
export const harnessEventSchema = z.intersection(
  z.object({
    sessionId: z.string(),
    organizationId: z.string(),
    turnId: z.string().nullable(),
    generation: z.number().int().min(0).nullable(),
    timestamp: z.number(),
  }),
  harnessEventBodySchema,
);
export type HarnessEvent = z.infer<typeof harnessEventSchema>;

export interface HarnessHost {
  listModels(
    scope: Omit<HarnessLocalScope, "agentId"> & { agentId?: string },
  ): Promise<HarnessModelCatalog>;
  configure(configuration: HarnessConfiguration): Promise<void>;
  /** Skills in the agent folder. MCP servers live in Substrate's local storage, not here. */
  scanConfiguration(scope: HarnessLocalScope): Promise<HarnessNativeConfiguration>;
  saveSkill(input: HarnessLocalScope & { skill: HarnessSkill }): Promise<void>;
  deleteSkill(input: HarnessLocalScope & { id: string }): Promise<void>;
  /** Overwrites the Substrate default instructions, profile, and skill files. Other files stay. */
  resetDefaults(scope: HarnessLocalScope): Promise<void>;
  inspect(): Promise<HarnessInspection[]>;
  execute<C extends HarnessCommand>(command: C): Promise<HarnessCommandResult<C>>;
  subscribe(listener: (event: HarnessEvent) => void): () => void;
  dispose(): Promise<void>;
}
