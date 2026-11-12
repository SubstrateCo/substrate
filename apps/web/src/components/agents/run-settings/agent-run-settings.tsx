import type { AgentRunSettings as AgentRunSettingsData } from "@substrate/contracts/agents";

import { AgentRunSettingsView } from "./agent-run-settings-view";
import { CallerSettings } from "./caller-settings";
import { triggersInput } from "@/lib/agents/triggers";
import { isDesktop } from "@/lib/desktop/auth";
import { useAgentRunSettingsMutations } from "@/queries/agents/mutations";
import { toast } from "sonner";

export function AgentRunSettings({
  userId,
  organizationId,
  name,
  settings,
}: {
  userId: string;
  organizationId?: string | null;
  name: string;
  settings: AgentRunSettingsData;
}) {
  const { home, triggers } = useAgentRunSettingsMutations(userId, settings.agentId);
  return (
    <AgentRunSettingsView
      name={name}
      settings={settings}
      callers={
        organizationId && (
          <CallerSettings
            userId={userId}
            organizationId={organizationId}
            agentId={settings.agentId}
          />
        )
      }
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
