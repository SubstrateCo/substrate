import { Link, type LinkProps } from "@tanstack/react-router";

import type { ReactNode, Ref } from "react";

import { WorkIndicator } from "../work-indicator";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { toneFill } from "@/components/feedback/tag";
import {
  PageContent,
  PageLayout,
  PageSidebar,
  PageSidebarContent,
  PageSidebarGroupTitle,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkStatus } from "@/lib/agent-work/status";
import type { ResourceStatus } from "@/lib/resource-state";
import { cn } from "cn";
import { Hand, Plus } from "lucide-react";

export type AgentListItem = {
  id: string;
  name: string;
  image?: string | null;
  status?: WorkStatus;
};

/** The Agents app: Needs you and each agent in the sidebar, the selection beside it. */
export function AgentsWorkspaceView({
  agents,
  catalogState,
  catalogError,
  onRetryCatalog,
  needsYouCount,
  selectedAgentId,
  agentLink,
  onCreate,
  createButtonRef,
  editor,
  content,
  aside,
}: {
  agents: AgentListItem[];
  catalogState: ResourceStatus;
  catalogError: Error | null;
  onRetryCatalog: () => void;
  needsYouCount: number;
  selectedAgentId?: string;
  agentLink: (agentId?: string) => LinkProps;
  onCreate: () => void;
  /** The New agent button, where focus goes once an agent is deleted. */
  createButtonRef?: Ref<HTMLButtonElement>;
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
                  <Button
                    ref={createButtonRef}
                    size="icon-sm"
                    variant="ghost"
                    aria-label="New agent"
                    onClick={onCreate}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New agent</TooltipContent>
              </Tooltip>
            }
          />
          <PageSidebarContent>
            <nav aria-label="Agent views" className="grid min-w-0 grid-cols-1 gap-0.5">
              <Button
                asChild
                variant="sidebar"
                aria-current={!selectedAgentId ? "page" : undefined}
                className="w-full justify-start"
              >
                <Link {...agentLink()} activeOptions={{ explicitUndefined: true }}>
                  <Hand aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-left">Needs you</span>
                  {needsYouCount > 0 && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full px-1.5 text-xs font-medium text-warning-text tabular-nums",
                        toneFill.warning,
                      )}
                    >
                      <span className="sr-only">, </span>
                      {needsYouCount}
                    </span>
                  )}
                </Link>
              </Button>
            </nav>
            <section
              aria-label="Your agents"
              aria-busy={catalogState === "loading"}
              className="grid min-w-0 grid-cols-1 gap-0.5"
            >
              <PageSidebarGroupTitle>Your agents</PageSidebarGroupTitle>
              {catalogState === "loading" && (
                <LoadingState label="Loading agents" variant="compact" />
              )}
              {catalogError && (
                <div className="px-2">
                  <ErrorState
                    inline
                    title={
                      catalogState === "unavailable" ? "Agents unavailable" : "Couldn’t load agents"
                    }
                    onRetry={catalogState === "unavailable" ? undefined : onRetryCatalog}
                  />
                </div>
              )}
              {catalogState === "ready" && !agents.length && (
                <div className="px-2">
                  <ContentNotice variant="inline" title="No agents yet" />
                </div>
              )}
              {agents.map((agent) => (
                <Button
                  key={agent.id}
                  asChild
                  variant="sidebar"
                  aria-current={agent.id === selectedAgentId ? "page" : undefined}
                  className="w-full justify-start"
                >
                  <Link {...agentLink(agent.id)}>
                    <span className="relative grid size-6 shrink-0 place-items-center">
                      <PersonAvatar name={agent.name} image={agent.image} agent />
                      {agent.status && (
                        <WorkIndicator
                          tone={agent.status.tone}
                          label={agent.status.label}
                          compact
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{agent.name}</span>
                  </Link>
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
