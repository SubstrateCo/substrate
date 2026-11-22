/**
 * The version-neutral seam between the ACP client and one ACP protocol version. A driver owns
 * the wire: its SDK entrypoint, schemas and method names. connection.ts, peer.ts and adapter.ts
 * use only the types in this file, so a v2 driver can be added without touching them.
 */
import type { JsonValue } from "../json.ts";
import type {
  AcpAuthMethod,
  AcpConfigOption,
  AcpPeerCapabilities,
  AcpProtocolVersion,
} from "./api.ts";
import type { McpServerAdapter } from "@agentclientprotocol/sdk/experimental/mcp-server";

/** Newline-delimited JSON bytes to and from the agent process. */
export interface AcpTransport {
  /** Bytes the client writes to the agent (its stdin). */
  output: WritableStream<Uint8Array>;
  /** Bytes the agent writes to the client (its stdout). */
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
  /** Served by this client over `mcp/message`. Only from AcpDriverConnection.provideMcpServer. */
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

/** An MCP server this client serves on one connection. */
export interface AcpMcpRegistration {
  /** Put this in the session's mcpServers. */
  readonly declaration: AcpMcpServerAcp;
  /** Later requests fail with -33001; active requests are cancelled. */
  dispose(): Promise<void>;
}

/** Fields every session setup request carries. */
export interface AcpSessionSetup {
  cwd: string;
  mcpServers: AcpMcpServer[];
  /** Appended to the agent's own instructions. Send only when capabilities.systemPrompt.append. */
  systemPrompt?: string;
  /** Initial values, sent only when the agent advertises session.options. */
  configOptions?: { id: string; value: AcpConfigValue }[];
}

export interface AcpSessionOpened {
  sessionId: string;
  configOptions: AcpConfigOption[];
}

export type AcpToolStatus = "pending" | "in_progress" | "completed" | "failed";

/** One session/update, reduced to what the client acts on. */
export type AcpUpdate =
  | { type: "text"; text: string; messageId?: string }
  | {
      type: "tool";
      toolCallId: string;
      /** True for the first announcement of a tool call. */
      created: boolean;
      title?: string;
      kind?: string;
      /** Programmatic tool name, when the agent reports it. */
      name?: string;
      rawInput?: unknown;
      status?: AcpToolStatus;
    }
  | { type: "usage"; used: number; size: number }
  | { type: "compaction"; status: string }
  | { type: "commands"; names: string[] }
  | { type: "config"; options: AcpConfigOption[] };

/**
 * A request from the agent that needs an answer from the user. data is the native request
 * params; the host forwards it unchanged in request.opened.
 */
export interface AcpClientRequest<R> {
  kind: "permission" | "input";
  /** Absent for requests outside a session, such as request-scoped elicitation. */
  sessionId?: string;
  data: unknown;
  /** The no-ask answer: unattended turns and requests without a live turn. */
  deny(): R;
  /** The answer after an interrupt or disconnect. */
  cancelled(): R;
  /** Parses the host's response. Throws HarnessError("invalid-response") for a bad shape. */
  parse(response: JsonValue | undefined): R;
}

/** Callbacks a driver calls for agent-initiated traffic. Set before initialize. */
export interface AcpDriverHandlers {
  update(sessionId: string, update: AcpUpdate): void;
  request<R>(request: AcpClientRequest<R>, signal: AbortSignal): Promise<R>;
}

/** A new value for a config option, matching the option's type. */
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

/** An initialized connection that speaks exactly one protocol version. */
export interface AcpDriverConnection {
  readonly protocolVersion: AcpProtocolVersion;
  readonly agentInfo?: { name: string; version: string };
  readonly capabilities: AcpPeerCapabilities;
  readonly authMethods: AcpAuthMethod[];
  /** Resolves when the connection ends for any reason. */
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
  /** Only when capabilities.steering is not "none". */
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
  /** Ends the connection. Pending requests reject with error, or a disconnected error. */
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
