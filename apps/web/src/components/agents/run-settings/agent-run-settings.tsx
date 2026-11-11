import type { AgentRunSettings as AgentRunSettingsData } from "@substrate/contracts/agents";

import { AgentRunSettingsView } from "./agent-run-settings-view";
import { triggersInput } from "@/lib/agents/triggers";
import { isDesktop } from "@/lib/desktop/auth";
import { useAgentRunSettingsMutations } from "@/queries/agents/mutations";
import { toast } from "sonner";

export function AgentRunSettings({
  userId,
  name,
  settings,
}: {
  userId: string;
  name: string;
  settings: AgentRunSettingsData;
}) {
  const { home, triggers } = useAgentRunSettingsMutations(userId, settings.agentId);
  return (
    <AgentRunSettingsView
      name={name}
      settings={settings}
      canRunHere={isDesktop()}
      moving={home.isPending}
      saving={triggers.isPending}
      error={home.error ?? triggers.error}
      onRunHere={() =>
        home.mutate(undefined, {
          onSuccess: () => toast.success(`${name} now runs on this device.`),
        })
      }
      onSave={(next) => triggers.mutate(triggersInput(settings.agentId, next))}
    />
  );
}
