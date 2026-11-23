import { useQuery } from "@tanstack/react-query";
import { linkOptions, useNavigate } from "@tanstack/react-router";

import { useRef, useState } from "react";

import { ActivityTurnTranscript } from "../transcript/activity-turn-transcript";
import { AgentPage } from "./agent-page";
import { AgentsWorkspaceView } from "./agents-workspace-view";
import { FirstAgentView } from "./first-agent-view";
import { NeedsYou } from "./needs-you";
import { useWorkspaceAgents } from "./use-workspace-agents";
import { AgentSettings } from "@/components/agents/agent-settings";
import { ContentNotice } from "@/components/feedback/content-notice";
import { PaneState } from "@/components/feedback/pane-state";
import { useFocusAfterRender } from "@/components/feedback/use-focus-after-render";
import type { AgentPageSection } from "@/lib/agent-work/agent-sections";
import { needsYouCount } from "@/lib/agent-work/needs-you";
import type { ResourceState } from "@/lib/resource-state";
import { needsYouOptions } from "@/queries/agent-work/server";
import { Unlink } from "lucide-react";

type AgentsSearch = {
  agentId?: string;
  turnId?: string;
  messageId?: string;
  section?: AgentPageSection;
};

/** The pane for an agent the catalog doesn't list: still loading, gone, or failed to load. */
function MissingAgent({
  catalogState,
  onRetry,
}: {
  catalogState: ResourceState<unknown>;
  onRetry: () => void;
}) {
  if (catalogState.status === "loading") return <PaneState label="Loading agent…" />;
  if (catalogState.status === "unavailable" || catalogState.status === "ready")
    return (
      <ContentNotice
        icon={Unlink}
        title="Agent unavailable"
        description="This agent may have been deleted or you may no longer have access."
      />
    );
  return <PaneState label="Couldn’t load agent" error={catalogState.error} onRetry={onRetry} />;
}

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
  const { catalogState, retryCatalog, agents, status, selected, homedHere, firstAgent } =
    useWorkspaceAgents(userId, organizationId, agentId);
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
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
  let content;
  if (!agentId)
    content = firstAgent ? (
      <FirstAgentView onCreate={() => setCreating(true)} />
    ) : (
      <NeedsYou userId={userId} organizationId={organizationId} />
    );
  else if (!selected) content = <MissingAgent catalogState={catalogState} onRetry={retryCatalog} />;
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
      catalogState={catalogState.status}
      catalogError={catalogState.error}
      onRetryCatalog={retryCatalog}
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
        // A selected agent is the one agentId names.
        section === "activity" &&
        selected &&
        turnId && (
          <ActivityTurnTranscript
            key={turnId}
            userId={userId}
            organizationId={organizationId}
            agentId={selected.id}
            agentName={selected.name}
            homedHere={homedHere}
            device={status(selected.id)?.device?.name}
            turnId={turnId}
            onClose={() => go({ agentId: selected.id, section: "activity" })}
          />
        )
      }
    />
  );
}
