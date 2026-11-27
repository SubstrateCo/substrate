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

/**
 * Renderer-local methods for MCP servers and working folders. Main keeps them in local storage,
 * not agent folders.
 */
type MainLocalMethod = "saveMcpServer" | "deleteMcpServer" | "chooseWorkspace" | "clearWorkspace";
/** Renderer-local methods that the harness worker serves from the agent folder. */
export type NativeLocalMethod = Exclude<LocalHarnessMethod, MainLocalMethod>;

/** An agent's user-added MCP servers in the account's local storage, per organization. */
export interface LocalMcpServers {
  list(organizationId: string, agentId: string): Promise<HarnessMcpServer[]>;
  save(organizationId: string, agentId: string, server: HarnessMcpServer): Promise<void>;
  delete(organizationId: string, agentId: string, id: string): Promise<void>;
}

/** An agent's working folder in the account's local storage, per organization. */
export interface LocalWorkspaces {
  get(organizationId: string, agentId: string): Promise<string | null>;
  /** Null returns the agent to its own folder. Its sessions then move to a new epoch. */
  set(organizationId: string, agentId: string, path: string | null): Promise<void>;
}

/** The agent is not homed on this desktop, so its skills and MCP servers are not edited here. */
export class AgentNotHomedHere extends Error {
  constructor() {
    super("Edit this agent's skills and MCP servers on its home desktop.");
    this.name = "AgentNotHomedHere";
  }
}

/**
 * Skills and MCP servers stay on the agent's home desktop, which is the only copy the agent uses.
 * Throws unless agentId is in the verified catalog and homed on this desktop.
 */
export function requireHomedHere(catalog: AgentCatalog, agentId: string) {
  if (!catalog.agents.some((agent) => agent.id === agentId)) throw new Error("Agent not found.");
  const settings = catalog.runSettings.find((entry) => entry.agentId === agentId);
  if (!settings?.homeDevice?.current) throw new AgentNotHomedHere();
}

/** Renderer input for the worker, scoped to the verified organization. Throws when invalid. */
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

/** The agent and server of a renderer save. A new server takes its name as its stable ID. */
export function prepareMcpServerSave(value: IpcValue) {
  const { agentId, ...server } = rendererLocalSchemas.saveMcpServer.parse(value);
  const id = harnessIdSchema.parse(server.id ?? server.name);
  return { agentId, server: { ...server, id } satisfies HarnessMcpServer };
}
