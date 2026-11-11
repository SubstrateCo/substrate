import type {
  HarnessInspection,
  HarnessKind,
  HarnessLocalConfiguration,
  HarnessModelCatalog,
} from "./index.ts";

/**
 * Main derives the account and organization for every desktop operation. The renderer only
 * configures harnesses; agent work runs in main and is exposed through AgentWorkAPI.
 */
export interface HarnessAPI {
  synchronize(): Promise<{ connected: true; organizationId: string }>;
  status(): Promise<{
    connected: boolean;
    organizationId?: string;
    harnesses?: HarnessInspection[];
  }>;
  listModels(input: { harness: HarnessKind; agentId?: string }): Promise<HarnessModelCatalog>;
  scanConfiguration(input: {
    harness: HarnessKind;
    agentId: string;
  }): Promise<HarnessLocalConfiguration>;
  saveSkill(input: {
    harness: HarnessKind;
    agentId: string;
    id?: string;
    name: string;
    description: string;
    content: string;
  }): Promise<void>;
  deleteSkill(input: { harness: HarnessKind; agentId: string; id: string }): Promise<void>;
  resetDefaults(input: { harness: HarnessKind; agentId: string }): Promise<void>;
  saveMcpServer(input: {
    harness: HarnessKind;
    agentId: string;
    id?: string;
    name: string;
    transport: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    environment?: Record<string, string>;
  }): Promise<void>;
  deleteMcpServer(input: { harness: HarnessKind; agentId: string; id: string }): Promise<void>;
  disconnect(): Promise<void>;
}

declare global {
  interface Window {
    readonly substrateHarness?: HarnessAPI;
  }
}
