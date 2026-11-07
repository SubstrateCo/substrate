import type {
  HarnessCommand,
  HarnessEvent,
  HarnessInspection,
  HarnessKind,
  HarnessMcpServer,
  HarnessSessionRef,
  HarnessSkill,
  HarnessModelCatalog,
} from "./index.ts";

/** Main derives the account and organization for every desktop operation. */
export interface HarnessAPI {
  readonly version: 1;
  synchronize(): Promise<{ connected: true; organizationId: string }>;
  inspect(): Promise<{
    connected: boolean;
    organizationId?: string;
    harnesses?: Omit<HarnessInspection, "executable" | "error">[];
  }>;
  status(): ReturnType<HarnessAPI["inspect"]>;
  listModels(input: { harness: HarnessKind }): Promise<HarnessModelCatalog>;
  scanConfiguration(input: { harness: HarnessKind }): Promise<{
    organizationId: string;
    harness: HarnessKind;
    skills: HarnessSkill[];
    mcpServers: HarnessMcpServer[];
  }>;
  scanSkills(input: { harness: HarnessKind }): Promise<{
    organizationId: string;
    harness: HarnessKind;
    skills: HarnessSkill[];
  }>;
  saveSkill(input: {
    harness: HarnessKind;
    id?: string;
    name: string;
    description: string;
    content: string;
  }): Promise<void>;
  deleteSkill(input: { harness: HarnessKind; id: string }): Promise<void>;
  saveMcpServer(input: {
    harness: HarnessKind;
    id?: string;
    name: string;
    transport: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    environment?: Record<string, string>;
  }): Promise<void>;
  deleteMcpServer(input: { harness: HarnessKind; id: string }): Promise<void>;
  execute(command: HarnessCommand): Promise<HarnessSessionRef | void>;
  disconnect(): Promise<void>;
  reset(): Promise<void>;
  onEvent(callback: (event: HarnessEvent) => void): () => void;
}

declare global {
  interface Window {
    readonly startupOSHarness?: HarnessAPI;
  }
}
