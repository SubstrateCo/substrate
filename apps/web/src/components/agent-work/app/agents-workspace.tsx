import { needsYouCount } from "@substrate/contracts/agent-work/needs-you";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useRef, useState, type ReactNode } from "react";

import { ActivityTurnTranscript } from "../transcript/activity-turn-transcript";
import { AgentPage } from "./agent-page";
import { AgentsWorkspaceView } from "./agents-workspace-view";
import { FirstAgentView } from "./first-agent-view";
import { NeedsYou } from "./needs-you";
import { useWorkspaceAgents } from "./use-workspace-agents";
import { NewAgentDialog } from "@/components/agents/new-agent-dialog";
import { AgentSettingsSheet } from "@/components/agents/settings/agent-settings-sheet";
import { ContentNotice } from "@/components/feedback/content-notice";
import { PaneState } from "@/components/feedback/pane-state";
import { useFocusAfterRender } from "@/components/feedback/use-focus-after-render";
import { PageSheet } from "@/components/layout/page-sheet";
import { usePanelReturn } from "@/components/layout/use-panel-return";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { AgentSettingsPage, AgentView } from "@/lib/agent-work/agent-sections";
import { agentLink } from "@/lib/navigation/record-links";
import type { ResourceState } from "@/lib/resource-state";
import { needsYouOptions } from "@/queries/agent-work/server";
import { Unlink } from "lucide-react";

type AgentsSearch = {
  agentId?: string;
  turnId?: string;
  messageId?: string;
  view?: AgentView;
  settings?: AgentSettingsPage;
};

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
  needsYou: ReactNode;
  agent: ReactNode;
}) {
  if (!agentId) return firstAgent ? <FirstAgentView onCreate={onCreate} /> : needsYou;
  return agent || <MissingAgent catalogState={catalogState} onRetry={onRetryCatalog} />;
}

export function AgentsWorkspace({
  agentId,
  turnId,
  messageId,
  view,
  settings,
}: {
  agentId?: string;
  turnId?: string;
  messageId?: string;
  view: AgentView;
  settings?: AgentSettingsPage;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const navigate = useNavigate({ from: "/agents" });
  const dismiss = usePanelReturn();
  const [creating, setCreating] = useState(false);
  const newAgentButton = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useFocusAfterRender();
  const { catalogState, retryCatalog, agents, status, selected, firstAgent } = useWorkspaceAgents(
    userId,
    organizationId,
    agentId,
  );
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  const go = ({ agentId: id, ...target }: AgentsSearch) =>
    void navigate(agentLink(organizationId, id, target));
  const changeSettings = (page?: AgentSettingsPage) => {
    if (!page || (page === "overview" && settings)) return dismiss({ settings: page });
    void navigate({
      to: "/agents",
      search: (previous) => ({ ...previous, settings: page }),
      resetScroll: false,
    });
  };
  const onDeleted = () => {
    go({});
    focusAfterRender(() => newAgentButton.current);
  };
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
            avatar={selected.avatar}
            enabled={selected.enabled}
            status={status(selected.id)}
            view={view}
            settingsOpen={!!settings}
            selectedTurnId={turnId}
            messageId={messageId}
            onMessageNavigate={(target) =>
              go({ agentId: selected.id, view: "messages", settings, ...target })
            }
            onViewChange={(next) => go({ agentId: selected.id, view: next, settings })}
            onSettingsChange={(open) => changeSettings(open ? "overview" : undefined)}
            onTranscript={(id) => go({ agentId: selected.id, view: "work", turnId: id })}
          />
        )
      }
    />
  );
  const sheet = (
    <PageSheet
      open={!!selected && !!settings}
      label="Agent settings"
      onOpenChange={(open) => {
        if (!open && selected) changeSettings();
      }}
    >
      {selected && settings && (
        <AgentSettingsSheet
          key={selected.id}
          agentId={selected.id}
          page={settings}
          onPageChange={changeSettings}
          onDeleted={onDeleted}
        />
      )}
    </PageSheet>
  );
  return (
    <AgentsWorkspaceView
      agents={agents}
      catalog={catalogState}
      onRetryCatalog={retryCatalog}
      needsYouCount={needsYouCount(needsYou.data)}
      selectedAgentId={agentId}
      agentLink={(id) => agentLink(organizationId, id)}
      onCreate={() => setCreating(true)}
      createButtonRef={newAgentButton}
      editor={
        creating && (
          <NewAgentDialog
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              go({ agentId: id });
            }}
          />
        )
      }
      content={content}
      sheet={sheet}
      aside={
        view === "work" &&
        selected &&
        turnId && (
          <ActivityTurnTranscript
            key={turnId}
            agentId={selected.id}
            agentName={selected.name}
            device={status(selected.id)?.device?.name}
            turnId={turnId}
            onClose={() => dismiss({ turnId: undefined })}
          />
        )
      }
    />
  );
}
