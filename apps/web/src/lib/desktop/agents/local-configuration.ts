import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import { harnessBridge } from "../bridges";
import type { LocalConfigurationController } from "@/lib/desktop/agents/local-configuration-controller";

export function desktopLocalConfiguration(
  harness: HarnessKind,
  agentId: string | undefined,
): LocalConfigurationController | undefined {
  const bridge = harnessBridge();
  if (!bridge || !agentId) return undefined;
  return {
    async scan() {
      await bridge.synchronize();
      const { skills, mcpServers, workspace } = await bridge.scanConfiguration({
        harness,
        agentId,
      });
      return { skills, mcpServers, workspace };
    },
    saveSkill: (skill) => bridge.saveSkill({ ...skill, harness, agentId }),
    deleteSkill: (id) => bridge.deleteSkill({ id, harness, agentId }),
    saveMcpServer: (server) => bridge.saveMcpServer({ ...server, agentId }),
    deleteMcpServer: (id) => bridge.deleteMcpServer({ id, agentId }),
    chooseWorkspace: () => bridge.chooseWorkspace({ agentId }),
    clearWorkspace: () => bridge.clearWorkspace({ agentId }),
    async resetDefaults() {
      // Reset writes from the latest saved agent, so sync it to the host first.
      await bridge.synchronize();
      await bridge.resetDefaults({ harness, agentId });
    },
  };
}
