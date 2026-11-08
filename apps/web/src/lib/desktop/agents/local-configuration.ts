import type { HarnessKind } from "@startup-os/contracts/harness";
import type {} from "@startup-os/contracts/harness/desktop";

import type { LocalConfigurationController } from "@/lib/desktop/agents/local-configuration-controller";

export function desktopLocalConfiguration(
  harness: HarnessKind,
  agentId: string | undefined,
): LocalConfigurationController | undefined {
  const bridge = window.startupOSHarness;
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
