import type { HarnessKind } from "@startup-os/contracts/harness";
import type {} from "@startup-os/contracts/harness/desktop";

import type { LocalConfigurationController } from "@/lib/desktop/agents/local-configuration-controller";

export function desktopLocalConfiguration(
  harness: HarnessKind,
): LocalConfigurationController | undefined {
  const bridge = window.startupOSHarness;
  if (!bridge) return undefined;
  return {
    async scan() {
      await bridge.synchronize();
      const { skills } = await bridge.scanSkills({ harness });
      return { skills };
    },
    saveSkill: (skill) => bridge.saveSkill({ ...skill, harness }),
    deleteSkill: (id) => bridge.deleteSkill({ id, harness }),
  };
}
