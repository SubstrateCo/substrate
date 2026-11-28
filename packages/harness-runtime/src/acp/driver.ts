import type { JsonValue } from "../json.ts";
import type {
  AcpAuthMethod,
  AcpConfigOption,
  AcpPeerCapabilities,
  AcpProtocolVersion,
} from "./api.ts";
import type { McpServerAdapter } from "@agentclientprotocol/sdk/experimental/mcp-server";

export interface AcpTransport {
  output: WritableStream<Uint8Array>;
  input: ReadableStream<Uint8Array>;
}

export type AcpMcpServer =
  | {
      type: "http";
      name: string;
      url: string;
      headers: { name: string; value: string }[];
    }
  | {
      type: "stdio";
      name: string;
      command: string;
      args: string[];
      env: { name: string; value: string }[];
    }
  | AcpMcpServerAcp;

export interface AcpMcpServerAcp {
  type: "acp";
  name: string;
  serverId: string;
}

/**
 * Answers one inner MCP request received as `mcp/message`. The type comes from the SDK's
 * version-neutral MCP binding (dist/mcp/core.d.ts McpRequestHandler); ACP v1 and v2 share it.
 */
export type AcpMcpHandler = McpServerAdapter["handler"];

export interface AcpMcpRegistration {
  readonly declaration: AcpMcpServerAcp;
  /** Later requests fail with -33001; active requests are cancelled. */
  dispose(): Promise<void>;
}

export interface AcpSessionSetup {
  cwd: string;
  additionalDirectories?: string[];
  mcpServers: AcpMcpServer[];
  systemPrompt?: string;
  configOptions?: { id: string; value: AcpConfigValue }[];
}

export interface AcpSessionOpened {
  sessionId: string;
  configOptions: AcpConfigOption[];
}

export type AcpToolStatus = "pending" | "in_progress" | "completed" | "failed";

export type AcpUpdate =
  | { type: "text"; text: string; messageId?: string }
  | {
      type: "tool";
      toolCallId: string;
      created: boolean;
      title?: string;
      kind?: string;
      name?: string;
      rawInput?: unknown;
      status?: AcpToolStatus;
    }
  | { type: "usage"; used: number; size: number }
  | { type: "compaction"; status: string }
  | { type: "commands"; names: string[] }
  | { type: "config"; options: AcpConfigOption[] };

export interface AcpClientRequest<R> {
  kind: "permission" | "input";
  sessionId?: string;
  data: unknown;
  deny(): R;
  cancelled(): R;
  parse(response: JsonValue | undefined): R;
}

export interface AcpDriverHandlers {
  update(sessionId: string, update: AcpUpdate): void;
  request<R>(request: AcpClientRequest<R>, signal: AbortSignal): Promise<R>;
}

type AcpConfigValue = { type: "select"; value: string } | { type: "boolean"; value: boolean };

export interface AcpPromptResult {
  /** "cancelled" means the turn ended because of session/cancel. */
  stopReason: string;
  usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
}

/**
 * injected: the text joined the running turn. promptRequired: no turn was running, so the
 * agent did not take the text. Other values are agent-specific.
 */
export type AcpSteerOutcome = "injected" | "promptRequired" | (string & {});

export interface AcpDriverConnection {
  readonly protocolVersion: AcpProtocolVersion;
  readonly agentInfo?: { name: string; version: string };
  readonly capabilities: AcpPeerCapabilities;
  readonly authMethods: AcpAuthMethod[];
  readonly closed: Promise<void>;
  newSession(setup: AcpSessionSetup, signal: AbortSignal): Promise<AcpSessionOpened>;
  loadSession(
    sessionId: string,
    setup: AcpSessionSetup,
    signal: AbortSignal,
  ): Promise<AcpSessionOpened>;
  resumeSession(
    sessionId: string,
    setup: AcpSessionSetup,
    signal: AbortSignal,
  ): Promise<AcpSessionOpened>;
  closeSession(sessionId: string, signal: AbortSignal): Promise<void>;
  deleteSession(sessionId: string, signal: AbortSignal): Promise<void>;
  sessionOptions(cwd: string, signal: AbortSignal): Promise<AcpConfigOption[]>;
  setConfigOption(
    sessionId: string,
    configId: string,
    value: AcpConfigValue,
    signal: AbortSignal,
  ): Promise<AcpConfigOption[]>;
  prompt(sessionId: string, text: string): Promise<AcpPromptResult>;
  cancel(sessionId: string): Promise<void>;
  steer(sessionId: string, text: string): Promise<AcpSteerOutcome>;
  authenticate(methodId: string, signal: AbortSignal): Promise<void>;
  logout(signal: AbortSignal): Promise<void>;
  /**
   * MCP-over-ACP provider side (RFD mcp-over-acp, Draft). Registers a server that answers the
   * agent's `mcp/message` requests on this connection; the driver routes each request to the
   * handler by serverId. Declare the returned server in session setup only when
   * capabilities.mcp.acp. Optional: a driver without it gets the HTTP fallback. Each driver
   * implements it with McpOverAcpProvider from its own SDK entrypoint.
   */
  provideMcpServer?(name: string, handler: AcpMcpHandler): AcpMcpRegistration;
  close(error?: Error): void;
}

export type AcpInitializeOutcome =
  | { type: "ready"; connection: AcpDriverConnection }
  /**
   * The agent does not speak this driver's version. versions lists what it offered: the
   * version it selected, or the supported list of a -32022 error. The process must be
   * restarted before initialize runs again.
   */
  | { type: "retry"; versions: number[] };

export interface ProtocolDriver {
  readonly version: AcpProtocolVersion;
  initialize(
    transport: AcpTransport,
    handlers: AcpDriverHandlers,
    signal: AbortSignal,
  ): Promise<AcpInitializeOutcome>;
}
