import type {
  AgentConfiguration,
  AgentRunSettings as AgentRunSettingsData,
} from "@substrate/contracts/agents";

import { AgentRunSettingsView } from "./agent-run-settings-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { savedAgentInput } from "@/lib/agents/saved-agent";
import { triggersInput } from "@/lib/agents/triggers";
import { isDesktop } from "@/lib/desktop/auth";
import { useAgentMutations, useAgentRunSettingsMutations } from "@/queries/agents/mutations";
import { toast } from "sonner";

export function AgentRunSettings({
  agent,
  settings,
}: {
  agent: AgentConfiguration;
  settings: AgentRunSettingsData;
}) {
  const { userId } = useWorkspaceScope();
  const { home, triggers } = useAgentRunSettingsMutations(userId, settings.agentId);
  const { save } = useAgentMutations(userId);
  const shownTriggers = triggers.isPending
    ? settings.triggers.map((trigger) => ({
        ...trigger,
        enabled:
          triggers.variables.triggers.find((next) => next.kind === trigger.kind)?.enabled ??
          trigger.enabled,
      }))
    : settings.triggers;
  const shownEnabled = save.isPending ? save.variables.enabled : agent.enabled;
  return (
    <AgentRunSettingsView
      enabled={shownEnabled}
      triggers={shownTriggers}
      homeDevice={settings.homeDevice}
      canRunHere={isDesktop()}
      moving={home.isPending}
      saving={triggers.isPending || save.isPending}
      moveError={home.error}
      saveError={triggers.error ?? save.error}
      onRunHere={() =>
        home.mutate(undefined, {
          onSuccess: () => toast.success(`${agent.name} now runs on this device.`),
        })
      }
      onEnabledChange={(enabled) => {
        triggers.reset();
        save.mutate(savedAgentInput(agent, { enabled }));
      }}
      onTriggerChange={(kind, enabled) => {
        save.reset();
        triggers.mutate(
          triggersInput(
            settings.agentId,
            settings.triggers.map((trigger) =>
              trigger.kind === kind ? { ...trigger, enabled } : trigger,
            ),
          ),
        );
      }}
    />
  );
}
