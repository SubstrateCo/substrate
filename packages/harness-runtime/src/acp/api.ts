/**
 * Shared contract between the ACP client streams. Implementations live beside this file:
 * - launch.ts / manifest.ts / detect.ts: which agents exist and how to start them.
 * - connection.ts: spawn, initialize with version negotiation, driver selection.
 * - adapter.ts: NativeAdapter over a negotiated connection.
 * - models.ts / auth.ts: catalog probe and sign-in over the same connection.
 */
import type { HarnessErrorCode, HarnessKind } from "@substrate/contracts/harness";

import type { AdapterContext, NativeAdapter } from "../adapters/types.ts";

/** Supported ACP major versions. The client asks for the highest enabled one. */
export type AcpProtocolVersion = 1 | 2;

/** A resolved, spawnable agent command. shell:false, native executable only. */
export interface AcpLaunch {
  harness: HarnessKind;
  /** Absolute path to a native executable (.exe on Windows) or Electron's execPath. */
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** Detected agent version, from package.json or --version. */
  version: string;
}

/** How the managed prefix reaches the agent. Static per manifest entry. */
export type AcpPrefixChannel = "systemPrompt" | "instructions";

/** Version-neutral summary of what the agent advertised in initialize. */
export interface AcpPeerCapabilities {
  loadSession: boolean;
  resume: boolean;
  close: boolean;
  delete: boolean;
  /** session/options (draft): config options without a session. */
  sessionOptions: boolean;
  systemPrompt: { append: boolean; override: boolean };
  mcp: { http: boolean; stdio: boolean; acp: boolean };
  /** _meta.steering.supported (_session/steering) on v1, or native prompt-while-busy on v2. */
  steering: "extension" | "native" | "none";
  logout: boolean;
  authStatus: boolean;
}

export interface AcpAuthMethod {
  id: string;
  name: string;
  description?: string;
  type: "agent" | "terminal";
  /** terminal only: appended to the agent's own launch args. */
  args?: string[];
  env?: Record<string, string>;
}

export interface AcpConfigSelectValue {
  value: string;
  name: string;
  description?: string;
}

/** A select config option, flattened from grouped or flat ACP options. */
export interface AcpConfigOption {
  id: string;
  name: string;
  category?: string;
  currentValue: string | boolean;
  type: "select" | "boolean";
  values: AcpConfigSelectValue[];
}

/**
 * An initialized ACP connection. One connection speaks exactly one negotiated version.
 * Close stops the agent process.
 */
export interface AcpPeer {
  readonly launch: AcpLaunch;
  readonly protocolVersion: AcpProtocolVersion;
  readonly agentInfo?: { name: string; version: string };
  readonly capabilities: AcpPeerCapabilities;
  readonly authMethods: AcpAuthMethod[];
  /** Config options for a throwaway session: session/options when advertised, else a probe. */
  probeConfigOptions(cwd: string, signal: AbortSignal): Promise<AcpConfigOption[]>;
  authenticate(methodId: string, signal: AbortSignal): Promise<void>;
  logout(signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

/** HarnessError code thrown by session setup when the agent answers auth_required. */
export const acpAuthRequired = "native-auth-required" satisfies HarnessErrorCode;

export interface AcpConnectOptions {
  launch: AcpLaunch;
  prefixChannel: AcpPrefixChannel;
  /** Managed prefix; sent as systemPrompt append when prefixChannel is systemPrompt. */
  prefix: string;
  resumeId?: string;
  context: AdapterContext;
}

export type OpenAcpPeer = (
  launch: AcpLaunch,
  options: { cwd: string; signal: AbortSignal },
) => Promise<AcpPeer>;
export type ConnectAcpAdapter = (options: AcpConnectOptions) => Promise<NativeAdapter>;
