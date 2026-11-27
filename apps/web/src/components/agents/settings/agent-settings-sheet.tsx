import type {
  AgentConfiguration as AgentConfigurationView,
  AgentRunSettings,
} from "@substrate/contracts/agents";

import { useQuery } from "@tanstack/react-query";

import { AgentSettingsLoading } from "./agent-settings-loading";
import { AgentSettingsOverview } from "./agent-settings-overview";
import { AgentSettingsSheetHeader } from "./agent-settings-sheet-header";
import { Routines } from "@/components/agent-work/routines/routines";
import { AgentConfiguration } from "@/components/agents/device/agent-configuration";
import { ErrorState } from "@/components/feedback/error-state";
import { PageSheetBody } from "@/components/layout/page-sheet";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { AgentSettingsPage } from "@/lib/agent-work/agent-sections";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";

/**
 * One agent's settings in the sheet over its page. The overview lists everything; routines,
 * skills, and MCP servers open as full lists in the same sheet, one level down.
 */
export function AgentSettingsSheet({
  agentId,
  page,
  onPageChange,
  onDeleted,
}: {
  agentId: string;
  page: AgentSettingsPage;
  onPageChange: (page: AgentSettingsPage) => void;
  onDeleted: () => void;
}) {
  const { userId } = useWorkspaceScope();
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const agent = catalog.data?.agents.find((item) => item.id === agentId);
  const runSettings = catalog.data?.runSettings.find((item) => item.agentId === agentId);
  return (
    <>
      <AgentSettingsSheetHeader page={page} onBack={() => onPageChange("overview")} />
      <PageSheetBody>
        <AgentSettingsBody
          agent={agent}
          runSettings={runSettings}
          error={catalog.error}
          onRetry={() => void catalog.refetch()}
          page={page}
          onPageChange={onPageChange}
          onDeleted={onDeleted}
        />
      </PageSheetBody>
    </>
  );
}

/** The agent's page once its catalog entry loads. A failed refresh keeps a loaded agent. */
function AgentSettingsBody({
  agent,
  runSettings,
  error,
  onRetry,
  page,
  onPageChange,
  onDeleted,
}: {
  agent: AgentConfigurationView | undefined;
  runSettings: AgentRunSettings | undefined;
  error: Error | null;
  onRetry: () => void;
  page: AgentSettingsPage;
  onPageChange: (page: AgentSettingsPage) => void;
  onDeleted: () => void;
}) {
  if (!agent && error)
    return <ErrorState variant="compact" title="Couldn’t load agent settings" onRetry={onRetry} />;
  if (!agent) return <AgentSettingsLoading page={page} />;
  switch (page) {
    case "overview":
      return (
        <AgentSettingsOverview
          agent={agent}
          runSettings={runSettings}
          onOpenPage={onPageChange}
          onDeleted={onDeleted}
        />
      );
    case "routines":
      return <Routines agentId={agent.id} name={agent.name} />;
    case "skills":
    case "mcps":
      return (
        <AgentConfiguration
          key={`${agent.harness}/${page}`}
          agentId={agent.id}
          harness={agent.harness}
          section={page}
          homeDevice={runSettings?.homeDevice ?? null}
        />
      );
  }
}
