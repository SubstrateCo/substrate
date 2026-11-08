import type { HarnessKind } from "./kinds.ts";
import type {
  HarnessInspection,
  HarnessLocalConfiguration,
  HarnessMcpServer,
  HarnessSkill,
} from "./local.ts";
import type { HarnessModelCatalog } from "./models.ts";

export { harnessKinds, type HarnessKind } from "./kinds.ts";
export {
  harnessIdSchema,
  harnessInspectionSchema,
  harnessLocalConfigurationSchema,
  harnessMcpServerSchema,
  harnessSkillSchema,
  type HarnessInspection,
  type HarnessLocalConfiguration,
  type HarnessMcpServer,
  type HarnessSkill,
} from "./local.ts";

export interface HarnessAgent {
  id: string;
  name: string;
  instructions: string;
  harness: HarnessKind;
  model?: string;
  enabled: boolean;
  useStartupDefaults: boolean;
}

export interface HarnessConfiguration {
  organizationId: string;
  agents: HarnessAgent[];
}

export interface HarnessLocalScope {
  organizationId: string;
  agentId: string;
  harness: HarnessKind;
}

export interface HarnessSessionRef extends HarnessLocalScope {
  id: string;
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

export interface HarnessHost {
  listModels(
    scope: Omit<HarnessLocalScope, "agentId"> & { agentId?: string },
  ): Promise<HarnessModelCatalog>;
  configure(configuration: HarnessConfiguration): Promise<void>;
  scanConfiguration(scope: HarnessLocalScope): Promise<HarnessLocalConfiguration>;
  saveSkill(input: HarnessLocalScope & { skill: HarnessSkill }): Promise<void>;
  deleteSkill(input: HarnessLocalScope & { id: string }): Promise<void>;
  /** Overwrites the Startup OS default instructions, profile, and skill files. Other files stay. */
  resetDefaults(scope: HarnessLocalScope): Promise<void>;
  saveMcpServer(input: HarnessLocalScope & { server: HarnessMcpServer }): Promise<void>;
  deleteMcpServer(input: HarnessLocalScope & { id: string }): Promise<void>;
  inspect(): Promise<HarnessInspection[]>;
  execute(command: HarnessCommand): Promise<HarnessSessionRef | void>;
  subscribe(listener: (event: HarnessEvent) => void): () => void;
  dispose(): Promise<void>;
}
export {
  harnessModelCatalogSchema,
  type HarnessModel,
  type HarnessModelCatalog,
} from "./models.ts";
