import type { AgentRunSettings as AgentRunSettingsData } from "@substrate/contracts/agents";

import { AgentRunSettingsView } from "./agent-run-settings-view";
import { CallerSettings } from "./caller-settings";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { triggersInput } from "@/lib/agents/triggers";
import { isDesktop } from "@/lib/desktop/auth";
import { useAgentRunSettingsMutations } from "@/queries/agents/mutations";
import { toast } from "sonner";

export function AgentRunSettings({
  name,
  settings,
}: {
  name: string;
  settings: AgentRunSettingsData;
}) {
  const { userId } = useWorkspaceScope();
  const { home, triggers } = useAgentRunSettingsMutations(userId, settings.agentId);
  return (
    <AgentRunSettingsView
      name={name}
      settings={settings}
      callers={<CallerSettings agentId={settings.agentId} />}
      canRunHere={isDesktop()}
      moving={home.isPending}
      saving={triggers.isPending}
      moveError={home.error}
      saveError={triggers.error}
      onRunHere={() =>
        home.mutate(undefined, {
          onSuccess: () => toast.success(`${name} now runs on this device.`),
        })
      }
      onSave={(next, onSuccess) =>
        triggers.mutate(triggersInput(settings.agentId, next), { onSuccess })
      }
    />
  );
}
