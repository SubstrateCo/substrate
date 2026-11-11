import type { HarnessKind } from "@substrate/contracts/harness";
import type {} from "@substrate/contracts/harness/desktop";

import type { LocalConfigurationController } from "@/lib/desktop/agents/local-configuration-controller";

export function desktopLocalConfiguration(
  harness: HarnessKind,
  agentId: string | undefined,
): LocalConfigurationController | undefined {
  const bridge = window.substrateHarness;
  if (!bridge || !agentId) return undefined;
  return {
    async scan() {
      await bridge.synchronize();
      const { skills, mcpServers } = await bridge.scanConfiguration({ harness, agentId });
      return { skills, mcpServers };
    },
    saveSkill: (skill) => bridge.saveSkill({ ...skill, harness, agentId }),
    deleteSkill: (id) => bridge.deleteSkill({ id, harness, agentId }),
    async resetDefaults() {
      // Reset writes from the latest saved agent, so sync it to the host first.
      await bridge.synchronize();
      await bridge.resetDefaults({ harness, agentId });
    },
  };
}
