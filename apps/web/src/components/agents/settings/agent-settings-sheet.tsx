import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

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
  let body: ReactNode;
  if (catalog.error && !agent)
    body = (
      <ErrorState
        variant="compact"
        title="Couldn’t load agent settings"
        onRetry={() => void catalog.refetch()}
      />
    );
  else if (!agent) body = <AgentSettingsLoading page={page} />;
  else if (page === "overview")
    body = (
      <AgentSettingsOverview
        agent={agent}
        runSettings={runSettings}
        onOpenPage={onPageChange}
        onDeleted={onDeleted}
      />
    );
  else if (page === "routines") body = <Routines agentId={agent.id} name={agent.name} />;
  else
    body = (
      <AgentConfiguration
        key={`${agent.harness}/${page}`}
        agentId={agent.id}
        harness={agent.harness}
        section={page}
        defaults={agent.useStartupDefaults}
        homeDevice={runSettings?.homeDevice ?? null}
      />
    );
  return (
    <>
      <AgentSettingsSheetHeader page={page} onBack={() => onPageChange("overview")} />
      <PageSheetBody>{body}</PageSheetBody>
    </>
  );
}
