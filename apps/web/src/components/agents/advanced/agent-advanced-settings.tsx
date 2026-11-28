import {
  agentOptionalAppIds,
  type AgentConfiguration,
  type AgentOptionalAppId,
} from "@substrate/contracts/agents";

import { useQuery } from "@tanstack/react-query";

import { AgentAdvancedSettingsView, type WorkingFolder } from "./agent-advanced-settings-view";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { savedAgentInput } from "@/lib/agents/saved-agent";
import { useAgentConfigurationMutations } from "@/queries/agents/configuration-mutations";
import {
  localAgentConfiguration,
  localConfigurationOptions,
} from "@/queries/agents/local-configuration";
import { useAgentMutations } from "@/queries/agents/mutations";

export function AgentAdvancedSettings({
  agent,
  homeDevice,
}: {
  agent: AgentConfiguration;
  homeDevice: { name: string; current: boolean } | null;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const apps = useOrganizationApps();
  const { save } = useAgentMutations(userId);
  const local = localAgentConfiguration(
    userId,
    organizationId,
    agent.id,
    agent.harness,
    !!homeDevice?.current,
  );
  const configuration = useQuery(localConfigurationOptions(userId, local));
  const { chooseWorkspace, clearWorkspace } = useAgentConfigurationMutations(local);
  const shown = save.isPending && save.variables.id === agent.id ? save.variables : agent;
  const disabledApps = shown.disabledApps ?? [];
  const folder: WorkingFolder = local
    ? { kind: "here", path: configuration.data?.workspace ?? null, reading: !configuration.data }
    : { kind: "elsewhere", deviceName: homeDevice?.name ?? null };
  const change = (changes: Parameters<typeof savedAgentInput>[1]) => {
    save.reset();
    save.mutate(savedAgentInput(agent, changes));
  };
  return (
    <AgentAdvancedSettingsView
      folder={folder}
      guide={shown.substrateGuide ?? true}
      apps={agentOptionalAppIds
        .filter((app) => apps.enabled(app))
        .map((app) => ({ app, enabled: !disabledApps.includes(app) }))}
      saving={save.isPending}
      choosing={chooseWorkspace.isPending}
      clearing={clearWorkspace.isPending}
      saveError={save.variables?.id === agent.id ? save.error : null}
      folderError={chooseWorkspace.error ?? clearWorkspace.error}
      onChooseFolder={() => {
        clearWorkspace.reset();
        chooseWorkspace.mutate();
      }}
      onClearFolder={() => {
        chooseWorkspace.reset();
        clearWorkspace.mutate();
      }}
      onGuideChange={(substrateGuide) => change({ substrateGuide })}
      onAppChange={(app: AgentOptionalAppId, enabled) =>
        change({
          disabledApps: enabled
            ? agent.disabledApps.filter((disabled) => disabled !== app)
            : [...agent.disabledApps, app],
        })
      }
    />
  );
}
