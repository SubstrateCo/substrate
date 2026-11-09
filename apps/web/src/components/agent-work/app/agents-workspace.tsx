import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { ActivityTurnTranscript } from "../transcript/activity-turn-transcript";
import { AgentActivity } from "./agent-activity";
import { AgentsWorkspaceView } from "./agents-workspace-view";
import { NeedsYou } from "./needs-you";
import { PaneState } from "@/components/feedback/pane-state";
import { needsYouCount } from "@/lib/agent-work/needs-you";
import { agentStatus } from "@/lib/agent-work/status";
import { hasAgentWorkBridge } from "@/queries/agent-work/bridge";
import { localAgentsOptions } from "@/queries/agent-work/local";
import { agentStatusOptions, needsYouOptions } from "@/queries/agent-work/server";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";

/**
 * The Agents app. Needs you comes from the server, so it works on every device. Activity,
 * transcripts, and routines come from the agent's home desktop.
 */
export function AgentsWorkspace({
  userId,
  organizationId,
  agentId,
  turnId,
}: {
  userId: string;
  organizationId: string;
  agentId?: string;
  turnId?: string;
}) {
  const navigate = useNavigate();
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const statuses = useQuery(agentStatusOptions(userId, organizationId));
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  const local = useQuery({
    ...localAgentsOptions(userId, organizationId),
    enabled: hasAgentWorkBridge(),
  });
  const go = (search: { agentId?: string; turnId?: string }) =>
    void navigate({ to: "/agents", search: { workspaceId: organizationId, ...search } });
  const status = (id: string) => statuses.data?.find((entry) => entry.userAgentId === id);
  const agents = (catalog.data?.agents ?? []).map((agent) => {
    const published = status(agent.id);
    return { id: agent.id, name: agent.name, status: published && agentStatus(published) };
  });
  const selected = agents.find((agent) => agent.id === agentId);
  const homedHere = !!agentId && !!local.data?.some((entry) => entry.userAgentId === agentId);
  let content;
  if (!agentId)
    content = (
      <NeedsYou
        userId={userId}
        organizationId={organizationId}
        onOpenAgent={(id) => go({ agentId: id })}
      />
    );
  else if (!selected)
    content = (
      <PaneState
        label={catalog.isPending ? "Loading agent…" : "Agent unavailable"}
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  else
    content = (
      <AgentActivity
        key={agentId}
        userId={userId}
        organizationId={organizationId}
        agentId={agentId}
        name={selected.name}
        homedHere={homedHere}
        status={status(agentId)}
        selectedTurnId={turnId}
        onTranscript={(id) => go({ agentId, turnId: id })}
      />
    );
  return (
    <AgentsWorkspaceView
      agents={agents}
      needsYouCount={needsYouCount(needsYou.data)}
      selectedAgentId={agentId}
      onSelect={(id) => go({ agentId: id })}
      settingsHref="/settings/user/agents"
      content={content}
      aside={
        agentId &&
        selected &&
        turnId && (
          <ActivityTurnTranscript
            key={turnId}
            userId={userId}
            organizationId={organizationId}
            agentId={agentId}
            agentName={selected.name}
            homedHere={homedHere}
            device={status(agentId)?.device?.name}
            turnId={turnId}
            onClose={() => go({ agentId })}
          />
        )
      }
    />
  );
}
