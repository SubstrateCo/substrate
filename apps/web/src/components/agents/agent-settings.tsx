import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AgentConfiguration } from "./device/agent-configuration";
import { AgentPicture } from "./editors/agent-picture";
import { AgentRunSettings } from "./run-settings/agent-run-settings";
import { saveAgent, deleteAgent } from "@/api/agents/requests";
import { AgentSettingsView } from "@/components/agents/agent-settings-view";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { queryKeys } from "@/queries/keys";
import { toast } from "sonner";

export function AgentSettings({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId?: string | null;
}) {
  const client = useQueryClient();
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.agents(userId) });
  const agent = useMutation({
    mutationFn: saveAgent,
    onSuccess: async () => {
      toast.success("Agent saved.");
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: deleteAgent,
    onSuccess: async () => {
      toast.success("Agent deleted.");
      await invalidate();
    },
  });
  return (
    <AgentSettingsView
      userId={userId}
      organizationId={organizationId}
      catalog={catalog.data}
      loading={catalog.isPending}
      error={catalog.error}
      pending={agent.isPending || remove.isPending}
      renderAgentPicture={(agent) => (
        <AgentPicture userId={userId} agentId={agent.id} image={agent.image} />
      )}
      renderAgentConfiguration={(harness, section, defaults, agentId) => (
        <AgentConfiguration
          key={`${harness}/${section}`}
          userId={userId}
          organizationId={organizationId}
          agentId={agentId}
          harness={harness}
          section={section}
          defaults={defaults}
        />
      )}
      renderRunSettings={(agent, settings, onClose) => (
        <AgentRunSettings
          key={agent.id}
          userId={userId}
          name={agent.name}
          settings={settings}
          onClose={onClose}
        />
      )}
      onRetry={() => void catalog.refetch()}
      onSaveAgent={async (input) => {
        await agent.mutateAsync(input);
      }}
      onDelete={async (id) => {
        await remove.mutateAsync(id);
      }}
    />
  );
}
