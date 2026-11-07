import type { HarnessKind } from "@startup-os/contracts/harness";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { AgentPicture } from "./agent-picture";
import type { LocalConfigurationController } from "./local-configuration";
import { saveAgent, deleteAgent } from "@/api/agents";
import { desktopLocalConfiguration } from "@/api/harness";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { queryKeys } from "@/queries/keys";
import { AgentSettingsView, type CatalogKind } from "@/ui/agents/agent-settings";

export function AgentSettings({
  userId,
  organizationId,
  localConfiguration: suppliedLocalConfiguration,
}: {
  userId: string;
  organizationId?: string | null;
  localConfiguration?: (harness: HarnessKind) => LocalConfigurationController | undefined;
}) {
  const [localHarness, setLocalHarness] = useState<HarnessKind>("opencode");
  const localConfiguration = (suppliedLocalConfiguration ?? desktopLocalConfiguration)(
    localHarness,
  );
  const client = useQueryClient();
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const localKey = queryKeys.localAgentConfiguration(userId, organizationId ?? "", localHarness);
  const local = useQuery({
    queryKey: localKey,
    enabled: !!localConfiguration && !!organizationId,
    queryFn: () => {
      if (!localConfiguration || !organizationId)
        throw new Error("Local configuration requires Electron and a selected organization.");
      return localConfiguration.scan();
    },
  });
  const requireLocal = () => {
    if (!localConfiguration || !organizationId)
      throw new Error("Local configuration requires Electron and a selected organization.");
    return localConfiguration;
  };
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.agents(userId) }),
      client.invalidateQueries({ queryKey: localKey }),
    ]);
  const invalidateLocal = () => client.invalidateQueries({ queryKey: localKey });
  const agent = useMutation({ mutationFn: saveAgent, onSuccess: invalidate });
  const skill = useMutation({
    mutationFn: (input: Parameters<LocalConfigurationController["saveSkill"]>[0]) =>
      requireLocal().saveSkill(input),
    onSuccess: invalidateLocal,
  });
  const remove = useMutation({
    mutationFn: async ({ kind, id }: { kind: CatalogKind; id: string }) => {
      if (kind === "agent") return deleteAgent(id);
      return requireLocal().deleteSkill(id);
    },
    onSuccess: invalidate,
  });
  return (
    <AgentSettingsView
      catalog={catalog.data}
      localConfiguration={local.data}
      localAvailable={!!localConfiguration && !!organizationId}
      localLoading={local.isFetching}
      localError={local.error}
      localHarness={localHarness}
      onLocalHarnessChange={setLocalHarness}
      onScan={() => void local.refetch()}
      loading={catalog.isPending}
      error={catalog.error}
      pending={agent.isPending || skill.isPending || remove.isPending}
      renderAgentPicture={(agent) => (
        <AgentPicture userId={userId} agentId={agent.id} image={agent.image} />
      )}
      onRetry={() => void catalog.refetch()}
      onSaveAgent={async (input) => {
        await agent.mutateAsync(input);
      }}
      onSaveSkill={async (input) => {
        await skill.mutateAsync(input);
      }}
      onDelete={async (kind, id) => {
        await remove.mutateAsync({ kind, id });
      }}
    />
  );
}
