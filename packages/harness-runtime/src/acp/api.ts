import type { HarnessErrorCode, HarnessKind } from "@substrate/contracts/harness-runtime";

import type { AdapterContext, NativeAdapter } from "../adapters/types.ts";

export type AcpProtocolVersion = 1 | 2;

export interface AcpLaunch {
  harness: HarnessKind;
  command: string;
  args: string[];
  env?: Record<string, string>;
  version: string;
}

export type AcpPrefixChannel = "systemPrompt" | "instructions";

export interface AcpPeerCapabilities {
  loadSession: boolean;
  resume: boolean;
  close: boolean;
  delete: boolean;
  /** session/options (draft): config options without a session. */
  sessionOptions: boolean;
  additionalDirectories: boolean;
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

export interface AcpConfigOption {
  id: string;
  name: string;
  category?: string;
  currentValue: string | boolean;
  type: "select" | "boolean";
  values: AcpConfigSelectValue[];
}

export interface AcpPeer {
  readonly launch: AcpLaunch;
  readonly protocolVersion: AcpProtocolVersion;
  readonly agentInfo?: { name: string; version: string };
  readonly capabilities: AcpPeerCapabilities;
  readonly authMethods: AcpAuthMethod[];
  probeConfigOptions(cwd: string, signal: AbortSignal): Promise<AcpConfigOption[]>;
  authenticate(methodId: string, signal: AbortSignal): Promise<void>;
  logout(signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export const acpAuthRequired = "native-auth-required" satisfies HarnessErrorCode;

export interface AcpConnectOptions {
  launch: AcpLaunch;
  prefixChannel: AcpPrefixChannel;
  prefix: string;
  resumeId?: string;
  launchEnvironment?: Record<string, string>;
  context: AdapterContext;
}

export type OpenAcpPeer = (
  launch: AcpLaunch,
  options: { cwd: string; signal: AbortSignal },
) => Promise<AcpPeer>;
export type ConnectAcpAdapter = (options: AcpConnectOptions) => Promise<NativeAdapter>;
