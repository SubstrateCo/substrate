import type { ReactNode } from "react";

import { WorkIndicator } from "../work-indicator";
import {
  PageContent,
  PageLayout,
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkStatus } from "@/lib/agent-work/status";
import { Hand, Plus } from "lucide-react";

export type AgentListItem = { id: string; name: string; status?: WorkStatus };

/** The Agents app: Needs you and each agent in the sidebar, the selection beside it. */
export function AgentsWorkspaceView({
  agents,
  agentsLoaded,
  needsYouCount,
  selectedAgentId,
  onSelect,
  onCreate,
  editor,
  content,
  aside,
}: {
  agents: AgentListItem[];
  /** False until the agent list loads, so the empty line does not flash. */
  agentsLoaded: boolean;
  needsYouCount: number;
  selectedAgentId?: string;
  onSelect: (agentId?: string) => void;
  onCreate: () => void;
  editor?: ReactNode;
  content: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <>
      <PageLayout
        id="agents"
        aria-label="Agents"
        mobileView={selectedAgentId ? "content" : undefined}
      >
        <PageSidebar aria-label="Agents">
          <PageSidebarHeader
            title="Agents"
            actions={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label="New agent" onClick={onCreate}>
                    <Plus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New agent</TooltipContent>
              </Tooltip>
            }
          />
          <PageSidebarContent>
            <nav aria-label="Agent views" className="grid gap-0.5">
              <Button
                type="button"
                variant="sidebar"
                aria-current={!selectedAgentId ? "page" : undefined}
                className="w-full justify-start"
                onClick={() => onSelect()}
              >
                <Hand aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">Needs you</span>
                {needsYouCount > 0 && (
                  <span className="rounded-full bg-warning/15 px-1.5 text-xs font-medium text-warning-text tabular-nums">
                    <span className="sr-only">, </span>
                    {needsYouCount}
                  </span>
                )}
              </Button>
            </nav>
            <section aria-label="Your agents" className="grid gap-0.5">
              <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">Your agents</h2>
              {agentsLoaded && !agents.length && (
                <p className="px-2 text-xs text-muted-foreground">You have no agents yet.</p>
              )}
              {agents.map((agent) => (
                <Button
                  key={agent.id}
                  type="button"
                  variant="sidebar"
                  aria-current={agent.id === selectedAgentId ? "page" : undefined}
                  className="w-full justify-start"
                  onClick={() => onSelect(agent.id)}
                >
                  <span className="relative grid size-6 shrink-0 place-items-center">
                    <PersonAvatar name={agent.name} agent />
                    {agent.status && (
                      <WorkIndicator tone={agent.status.tone} label={agent.status.label} compact />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{agent.name}</span>
                </Button>
              ))}
            </section>
          </PageSidebarContent>
        </PageSidebar>
        <PageContent>{content}</PageContent>
        {aside}
      </PageLayout>
      {editor}
    </>
  );
}
