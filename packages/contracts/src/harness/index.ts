import type { HarnessModelCatalog } from "./models.ts";

export const harnessKinds = ["opencode", "antigravity", "claude", "codex"] as const;
export type HarnessKind = (typeof harnessKinds)[number];

export interface HarnessAgent {
  id: string;
  name: string;
  instructions: string;
  harness: HarnessKind;
  model?: string;
  enabled: boolean;
  useStartupDefaults: boolean;
}

export interface HarnessSkill {
  id: string;
  name: string;
  description: string;
  content: string;
}

/** Configuration only. Credentials remain in each native harness's credential store. */
export interface HarnessMcpServer {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  environment?: Record<string, string>;
  /** Native credential-bearing entries must be edited in the native harness. */
  readOnly?: boolean;
}

export interface HarnessConfiguration {
  organizationId: string;
  agents: HarnessAgent[];
}

export interface HarnessLocalConfiguration {
  organizationId: string;
  harness: HarnessKind;
  directory: string;
  skills: HarnessSkill[];
  mcpServers: HarnessMcpServer[];
}

export interface HarnessLocalScope {
  organizationId: string;
  harness: HarnessKind;
}

export interface HarnessSessionRef {
  id: string;
  organizationId: string;
  agentId: string;
  harness: HarnessKind;
  nativeSessionId: string;
}

export type HarnessCommand =
  | { type: "start"; organizationId: string; agentId: string }
  | { type: "resume"; organizationId: string; sessionId: string }
  | { type: "prompt"; organizationId: string; sessionId: string; text: string }
  | { type: "interrupt"; organizationId: string; sessionId: string }
  | {
      type: "respond";
      organizationId: string;
      sessionId: string;
      requestId: string;
      response: unknown;
    }
  | { type: "disconnect"; organizationId: string; sessionId: string };

export type HarnessEvent = {
  sessionId: string;
  organizationId: string;
  timestamp: number;
} & (
  | { type: "session"; session: HarnessSessionRef }
  | { type: "text"; text: string; delta: boolean }
  | { type: "activity"; name: string; data: unknown }
  | { type: "request"; requestId: string; kind: "permission" | "input"; data: unknown }
  | { type: "turn-completed"; status: "completed" | "interrupted" | "failed" }
  | { type: "error"; code: string; message: string }
  | { type: "disconnected" }
);

export interface HarnessInspection {
  harness: HarnessKind;
  available: boolean;
  executable?: string;
  version?: string;
  error?: string;
  capabilities: { resume: boolean; permissions: boolean; nativeAgents: boolean };
}

export interface HarnessHost {
  listModels(scope: HarnessLocalScope): Promise<HarnessModelCatalog>;
  configure(configuration: HarnessConfiguration): Promise<{ directory: string }>;
  scanConfiguration(scope: HarnessLocalScope): Promise<HarnessLocalConfiguration>;
  scanSkills(
    scope: HarnessLocalScope,
  ): Promise<Pick<HarnessLocalConfiguration, "organizationId" | "harness" | "skills">>;
  saveSkill(input: HarnessLocalScope & { skill: HarnessSkill }): Promise<void>;
  deleteSkill(input: HarnessLocalScope & { id: string }): Promise<void>;
  saveMcpServer(input: HarnessLocalScope & { server: HarnessMcpServer }): Promise<void>;
  deleteMcpServer(input: HarnessLocalScope & { id: string }): Promise<void>;
  inspect(): Promise<HarnessInspection[]>;
  execute(command: HarnessCommand): Promise<HarnessSessionRef | void>;
  subscribe(listener: (event: HarnessEvent) => void): () => void;
  dispose(): Promise<void>;
}
export {
  harnessModelSchema,
  harnessModelCatalogSchema,
  type HarnessModel,
  type HarnessModelCatalog,
} from "./models.ts";
