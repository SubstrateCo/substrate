import type { ReactNode } from "react";

import { WorkIndicator } from "../work-indicator";
import {
  PageContent,
  PageLayout,
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import type { WorkStatus } from "@/lib/agent-work/status";
import { cn } from "cn";
import { Bot, Hand, Plus } from "lucide-react";

export type AgentListItem = { id: string; name: string; status?: WorkStatus };

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        active && "bg-sidebar-accent font-medium",
      )}
    >
      {children}
    </button>
  );
}

/** The Agents app: Needs you and each agent in the sidebar, the selection beside it. */
export function AgentsWorkspaceView({
  agents,
  needsYouCount,
  selectedAgentId,
  onSelect,
  onCreate,
  editor,
  content,
  aside,
}: {
  agents: AgentListItem[];
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
              <Button size="icon-sm" variant="ghost" aria-label="Create agent" onClick={onCreate}>
                <Plus aria-hidden="true" />
              </Button>
            }
          />
          <PageSidebarContent>
            <nav aria-label="Agent views" className="grid gap-0.5">
              <NavButton active={!selectedAgentId} onClick={() => onSelect()}>
                <Hand aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Needs you</span>
                {needsYouCount > 0 && (
                  <span className="rounded-full bg-destructive px-1.5 text-xs text-white tabular-nums">
                    {needsYouCount}
                  </span>
                )}
              </NavButton>
            </nav>
            <section aria-label="Your agents" className="grid gap-0.5">
              <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">Your agents</h2>
              {!agents.length && (
                <p className="px-2 text-xs text-muted-foreground">You have no agents yet.</p>
              )}
              {agents.map((agent) => (
                <NavButton
                  key={agent.id}
                  active={agent.id === selectedAgentId}
                  onClick={() => onSelect(agent.id)}
                >
                  <span className="relative grid size-5 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                    <Bot aria-hidden="true" className="size-3" />
                    {agent.status && (
                      <WorkIndicator tone={agent.status.tone} label={agent.status.label} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                </NavButton>
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
