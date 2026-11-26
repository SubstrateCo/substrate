import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useRef, useState, type ReactNode } from "react";

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
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { AgentPageSection } from "@/lib/agent-work/agent-sections";
import { needsYouCount } from "@/lib/agent-work/needs-you";
import { agentLink } from "@/lib/navigation/record-links";
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
  if (catalogState.status === "loading") return <PaneState label="Loading agent" />;
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

/** Needs you or the first-agent prompt without a selection; otherwise the selected agent. */
function AgentsContent({
  agentId,
  firstAgent,
  catalogState,
  onRetryCatalog,
  onCreate,
  needsYou,
  agent,
}: {
  agentId?: string;
  firstAgent: boolean;
  catalogState: ResourceState<unknown>;
  onRetryCatalog: () => void;
  onCreate: () => void;
  /** Shown without a selection once the owner has an agent. */
  needsYou: ReactNode;
  /** The page of the agent `agentId` names, when the catalog lists it. */
  agent: ReactNode;
}) {
  if (!agentId) return firstAgent ? <FirstAgentView onCreate={onCreate} /> : needsYou;
  return agent || <MissingAgent catalogState={catalogState} onRetry={onRetryCatalog} />;
}

/**
 * The Agents app. Needs you comes from the server, so it works on every device. Activity,
 * transcripts, and routines come from the agent's home desktop.
 */
export function AgentsWorkspace({
  agentId,
  turnId,
  messageId,
  section,
}: {
  agentId?: string;
  turnId?: string;
  messageId?: string;
  section: AgentPageSection;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const newAgentButton = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useFocusAfterRender();
  const { catalogState, retryCatalog, agents, status, selected, homedHere, firstAgent } =
    useWorkspaceAgents(userId, organizationId, agentId);
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  const go = ({ agentId: id, section: next, ...target }: AgentsSearch) =>
    void navigate(agentLink(organizationId, id, next, target));
  const content = (
    <AgentsContent
      agentId={agentId}
      firstAgent={firstAgent}
      catalogState={catalogState}
      onRetryCatalog={retryCatalog}
      onCreate={() => setCreating(true)}
      needsYou={<NeedsYou />}
      agent={
        selected && (
          <AgentPage
            key={selected.id}
            agentId={selected.id}
            name={selected.name}
            enabled={selected.enabled}
            homedHere={homedHere}
            status={status(selected.id)}
            section={section}
            selectedTurnId={turnId}
            messageId={messageId}
            onMessageNavigate={(target) =>
              go({ agentId: selected.id, section: "messages", ...target })
            }
            onSectionChange={(next) => go({ agentId: selected.id, section: next })}
            onTranscript={(id) => go({ agentId: selected.id, section: "activity", turnId: id })}
            onDeleted={() => {
              go({});
              focusAfterRender(() => newAgentButton.current);
            }}
          />
        )
      }
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
      agentLink={(id) => agentLink(organizationId, id)}
      onCreate={() => setCreating(true)}
      createButtonRef={newAgentButton}
      editor={
        creating && (
          <AgentSettings
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
