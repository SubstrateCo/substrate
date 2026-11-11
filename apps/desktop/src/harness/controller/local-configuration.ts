/* oxlint-disable deslop/no-unknown-parameters -- Local configuration payloads arrive from renderer IPC. */
import { harnessIdSchema } from "@substrate/contracts/harness";
import { rendererLocalSchemas, type LocalHarnessMethod } from "@substrate/contracts/harness/ipc";

export function prepareLocalInput(
  method: LocalHarnessMethod,
  value: unknown,
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
  if (method === "saveMcpServer") {
    const { harness, agentId, ...server } = rendererLocalSchemas.saveMcpServer.parse(value);
    return {
      organizationId,
      agentId,
      harness,
      server: { ...server, id: harnessIdSchema.parse(server.id ?? server.name) },
    };
  }
  return { ...rendererLocalSchemas[method].parse(value), organizationId };
}
