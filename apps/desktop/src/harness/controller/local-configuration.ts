import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import {
  harnessIdSchema,
  type HarnessLocalScope,
  type HarnessMcpServer,
  type HarnessSkill,
} from "@substrate/contracts/harness";
import { rendererLocalSchemas, type LocalHarnessMethod } from "@substrate/contracts/harness/ipc";

import type { z } from "zod";

/** Renderer-local methods for MCP servers. Main keeps them in local storage, not agent folders. */
export type McpServerMethod = "saveMcpServer" | "deleteMcpServer";
/** Renderer-local methods that the harness worker serves from the agent folder. */
export type NativeLocalMethod = Exclude<LocalHarnessMethod, McpServerMethod>;

/** An agent's user-added MCP servers in the account's local storage, per organization. */
export interface LocalMcpServers {
  list(organizationId: string, agentId: string): Promise<HarnessMcpServer[]>;
  save(organizationId: string, agentId: string, server: HarnessMcpServer): Promise<void>;
  delete(organizationId: string, agentId: string, id: string): Promise<void>;
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
