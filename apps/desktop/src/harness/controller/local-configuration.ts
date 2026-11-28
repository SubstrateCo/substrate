import type { AgentCatalog } from "@substrate/contracts/agents";
import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import {
  harnessIdSchema,
  type HarnessLocalScope,
  type HarnessMcpServer,
  type HarnessSkill,
} from "@substrate/contracts/harness-runtime";
import { rendererLocalSchemas, type LocalHarnessMethod } from "@substrate/contracts/harness/ipc";

import type { z } from "zod";

type MainLocalMethod = "saveMcpServer" | "deleteMcpServer" | "chooseWorkspace" | "clearWorkspace";
export type NativeLocalMethod = Exclude<LocalHarnessMethod, MainLocalMethod>;

export interface LocalMcpServers {
  list(organizationId: string, agentId: string): Promise<HarnessMcpServer[]>;
  save(organizationId: string, agentId: string, server: HarnessMcpServer): Promise<void>;
  delete(organizationId: string, agentId: string, id: string): Promise<void>;
}

export interface LocalWorkspaces {
  get(organizationId: string, agentId: string): Promise<string | null>;
  set(organizationId: string, agentId: string, path: string | null): Promise<void>;
}

export class AgentNotHomedHere extends Error {
  constructor() {
    super("Edit this agent's skills and MCP servers on its home desktop.");
    this.name = "AgentNotHomedHere";
  }
}

export function requireHomedHere(catalog: AgentCatalog, agentId: string) {
  if (!catalog.agents.some((agent) => agent.id === agentId)) throw new Error("Agent not found.");
  const settings = catalog.runSettings.find((entry) => entry.agentId === agentId);
  if (!settings?.homeDevice?.current) throw new AgentNotHomedHere();
}

export function prepareLocalInput(
  method: "saveSkill",
  value: IpcValue,
  organizationId: string,
): HarnessLocalScope & { skill: HarnessSkill };
export function prepareLocalInput<M extends Exclude<NativeLocalMethod, "saveSkill">>(
  method: M,
  value: IpcValue,
  organizationId: string,
): z.output<(typeof rendererLocalSchemas)[M]> & { organizationId: string };
export function prepareLocalInput(
  method: NativeLocalMethod,
  value: IpcValue,
  organizationId: string,
): object;
export function prepareLocalInput(
  method: NativeLocalMethod,
  value: IpcValue,
  organizationId: string,
) {
  if (method === "saveSkill") {
    const { harness, agentId, ...skill } = rendererLocalSchemas.saveSkill.parse(value);
    return {
      organizationId,
      agentId,
      harness,
      skill: { ...skill, id: harnessIdSchema.parse(skill.id ?? skill.name) },
    };
  }
  return { ...rendererLocalSchemas[method].parse(value), organizationId };
}

export function prepareMcpServerSave(value: IpcValue) {
  const { agentId, ...server } = rendererLocalSchemas.saveMcpServer.parse(value);
  const id = harnessIdSchema.parse(server.id ?? server.name);
  return { agentId, server: { ...server, id } satisfies HarnessMcpServer };
}
