import { useQuery } from "@tanstack/react-query";
import { linkOptions, useNavigate } from "@tanstack/react-router";

import { useRef, useState } from "react";

import { ActivityTurnTranscript } from "../transcript/activity-turn-transcript";
import { AgentPage } from "./agent-page";
import { AgentPageLoading } from "./agent-page-loading";
import type { AgentPageSection } from "./agent-sections";
import { AgentsWorkspaceView } from "./agents-workspace-view";
import { FirstAgentView } from "./first-agent-view";
import { NeedsYou } from "./needs-you";
import { AgentSettings } from "@/components/agents/agent-settings";
import { PaneState } from "@/components/feedback/pane-state";
import { useFocusAfterRender } from "@/components/feedback/use-focus-after-render";
import { needsYouCount } from "@/lib/agent-work/needs-you";
import { agentStatus } from "@/lib/agent-work/status";
import { hasAgentWorkBridge } from "@/queries/agent-work/bridge";
import { localAgentsOptions } from "@/queries/agent-work/local";
import { agentStatusOptions, needsYouOptions } from "@/queries/agent-work/server";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";

type AgentsSearch = {
  agentId?: string;
  turnId?: string;
  messageId?: string;
  section?: AgentPageSection;
};

/**
 * The Agents app. Needs you comes from the server, so it works on every device. Activity,
 * transcripts, and routines come from the agent's home desktop.
 */
export function AgentsWorkspace({
  userId,
  organizationId,
  agentId,
  turnId,
  messageId,
  section,
}: {
  userId: string;
  organizationId: string;
  agentId?: string;
  turnId?: string;
  messageId?: string;
  section: AgentPageSection;
}) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const newAgentButton = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useFocusAfterRender();
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const statuses = useQuery(agentStatusOptions(userId, organizationId));
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  const local = useQuery({
    ...localAgentsOptions(userId, organizationId),
    enabled: hasAgentWorkBridge(),
  });
  const agentLink = ({ section: next, ...search }: AgentsSearch) =>
    linkOptions({
      to: "/agents",
      search: {
        workspaceId: organizationId,
        ...search,
        section: next === "messages" ? undefined : next,
      },
    });
  const go = (search: AgentsSearch) => void navigate(agentLink(search));
  const status = (id: string) => statuses.data?.find((entry) => entry.userAgentId === id);
  const agents = (catalog.data?.agents ?? []).map((agent) => {
    const published = status(agent.id);
    return {
      id: agent.id,
      name: agent.name,
      enabled: agent.enabled,
      image: agent.image,
      status: published && agentStatus(published),
    };
  });
  const selected = agents.find((agent) => agent.id === agentId);
  const homedHere = !!agentId && !!local.data?.some((entry) => entry.userAgentId === agentId);
  const firstAgent = catalog.isSuccess && !agents.length;
  let content;
  if (!agentId)
    content = firstAgent ? (
      <FirstAgentView onCreate={() => setCreating(true)} />
    ) : (
      <NeedsYou userId={userId} organizationId={organizationId} />
    );
  else if (!selected && catalog.isPending) content = <AgentPageLoading section={section} />;
  else if (!selected)
    content = (
      <PaneState
        label="Agent unavailable"
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
      />
    );
  else
    content = (
      <AgentPage
        key={agentId}
        userId={userId}
        organizationId={organizationId}
        agentId={agentId}
        name={selected.name}
        enabled={selected.enabled}
        homedHere={homedHere}
        status={status(agentId)}
        section={section}
        selectedTurnId={turnId}
        messageId={messageId}
        onMessageNavigate={(target) => go({ agentId, section: "messages", ...target })}
        onSectionChange={(next) => go({ agentId, section: next })}
        onTranscript={(id) => go({ agentId, section: "activity", turnId: id })}
        onDeleted={() => {
          go({});
          focusAfterRender(() => newAgentButton.current);
        }}
      />
    );
  return (
    <AgentsWorkspaceView
      agents={agents}
      agentsLoaded={catalog.isSuccess}
      needsYouCount={needsYouCount(needsYou.data)}
      selectedAgentId={agentId}
      agentLink={(id) => agentLink({ agentId: id })}
      onCreate={() => setCreating(true)}
      createButtonRef={newAgentButton}
      editor={
        creating && (
          <AgentSettings
            userId={userId}
            organizationId={organizationId}
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              go({ agentId: id });
            }}
          />
        )
      }
      content={content}
      aside={
        agentId &&
        section === "activity" &&
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
            onClose={() => go({ agentId, section: "activity" })}
          />
        )
      }
    />
  );
}
