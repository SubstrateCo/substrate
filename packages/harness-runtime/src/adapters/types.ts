import type {
  AdapterCapabilities,
  HarnessAgent,
  HarnessEventBody,
  InterruptReceipt,
  TurnInput,
  TurnKind,
  TurnResult,
} from "@substrate/contracts/harness";

import type { JsonValue } from "../json.ts";
import type { McpLease } from "../mcp.ts";

/**
 * turn: the event belongs to the host's live turn, if one is live.
 * session: native output outside any turn of ours, such as a turn the harness started itself.
 */
export type EventScope = "turn" | "session";

export interface AdapterContext {
  model?: HarnessAgent["model"];
  directory: string;
  executable: string;
  /**
   * Stable MCP endpoint and token for the native session's configuration. The host binds the
   * current turn's context to it at each turn and unbinds it when the turn ends, so calls made
   * outside a turn fail.
   */
  lease?: McpLease;
  /** The host adds sessionId, organizationId, turnId, generation and timestamp. */
  emit(event: HarnessEventBody, scope?: EventScope): void;
}

/** The context of an adapter that delivers the managed prefix through a native channel. */
export interface NativePrefixContext extends AdapterContext {
  /** Managed policy prefix for this epoch. It stays byte-stable within the epoch. */
  prefix: string;
}

/** Per-turn options. unattended turns use the no-ask profile: every native prompt is denied. */
export interface TurnOptions {
  mode: TurnKind;
}

/** The message a no-ask profile returns to the model for each denied prompt. */
export const unattendedDenial = "Not allowed in background work; use propose or ask";

export interface NativeAdapter {
  readonly capabilities: AdapterCapabilities;
  readonly nativeSessionId: string;
  /** Resolves when the native turn ends. Events stream through AdapterContext.emit meanwhile. */
  turn(input: TurnInput, options: TurnOptions): Promise<TurnResult>;
  steer?(input: { inputId: string; text: string }): Promise<void>;
  compact?(): Promise<void>;
  interrupt(): Promise<InterruptReceipt>;
  /** The host has checked that the response is JSON. The adapter parses its shape. */
  respond(requestId: string, response: JsonValue | undefined): Promise<void>;
  disconnect(): Promise<void>;
}
