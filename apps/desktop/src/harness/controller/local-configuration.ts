/* oxlint-disable deslop/no-unknown-parameters -- Local configuration payloads arrive from renderer IPC. */
import {
  parseLocalConfiguration,
  rendererLocalSchemas,
  type LocalHarnessMethod,
} from "../bridge/harness-bridge.ts";

export function prepareLocalInput(
  method: LocalHarnessMethod,
  value: unknown,
  organizationId: string,
) {
  if (method === "saveSkill") {
    const { harness, agentId, ...skill } = rendererLocalSchemas.saveSkill.parse(value);
    return parseLocalConfiguration(method, {
      organizationId,
      agentId,
      harness,
      skill: { ...skill, id: skill.id ?? skill.name },
    });
  }
  if (method === "saveMcpServer") {
    const { harness, agentId, ...server } = rendererLocalSchemas.saveMcpServer.parse(value);
    return parseLocalConfiguration(method, {
      organizationId,
      agentId,
      harness,
      server: { ...server, id: server.id ?? server.name },
    });
  }
  return parseLocalConfiguration(method, {
    ...rendererLocalSchemas[method].parse(value),
    organizationId,
  });
}
