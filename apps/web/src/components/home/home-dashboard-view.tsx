import { useState, type ReactNode } from "react";

import { HomeAttention } from "./home-attention";
import { HomeEmptyWork } from "./home-empty-work";
import { HomeSection, type HomeSectionData } from "./home-section";
import { PageHeader } from "@/components/layout/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";
import { Bell, Bot, Handshake, ListTodo, MessageSquare } from "lucide-react";

export type HomeDashboardViewProps = {
  organizationId: string;
  date: string;
  attention: HomeSectionData;
  tasks: HomeSectionData;
  agents: HomeSectionData;
  conversations: HomeSectionData;
  deals: HomeSectionData;
  updates: HomeSectionData;
};

const sections = [
  ["attention", "Needs your attention"],
  ["tasks", "My work"],
  ["agents", "My agents"],
  ["updates", "Recent updates"],
  ["conversations", "Conversations"],
  ["deals", "CRM follow-ups"],
] as const;

function HomePanel({
  id,
  active,
  className,
  children,
}: {
  id: string;
  active: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-h-0 min-w-0", active !== id && "max-md:hidden", className)}>
      {children}
    </div>
  );
}

export function HomeDashboardView({
  organizationId,
  date,
  attention,
  tasks,
  agents,
  conversations,
  deals,
  updates,
}: HomeDashboardViewProps) {
  const search = { workspaceId: organizationId };
  const [activeSection, setActiveSection] = useState("attention");
  const quietAttention = !attention.loading && !attention.error && !attention.items.length;
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden" data-home-dashboard>
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-col gap-6 overflow-hidden p-6">
        <PageHeader
          title="Home"
          description={date}
          actions={
            <div className="w-48 md:hidden">
              <Select value={activeSection} onValueChange={setActiveSection}>
                <SelectTrigger aria-label="Dashboard section">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-4 md:grid-cols-2 md:grid-rows-3 xl:grid-cols-12 xl:grid-rows-7">
          <HomePanel
            id="attention"
            active={activeSection}
            className={
              quietAttention
                ? "xl:col-span-7 xl:col-start-1 xl:row-start-1"
                : "xl:col-span-8 xl:col-start-1 xl:row-span-2 xl:row-start-1"
            }
          >
            <HomeAttention organizationId={organizationId} data={attention} />
          </HomePanel>
          <HomePanel
            id="tasks"
            active={activeSection}
            className={cn(
              "xl:col-span-7 xl:col-start-1",
              quietAttention ? "xl:row-span-4 xl:row-start-2" : "xl:row-span-3 xl:row-start-3",
            )}
          >
            <HomeSection
              title="My work"
              description="Assigned to you · earliest due first"
              icon={ListTodo}
              emptyTitle="No open tasks assigned to you"
              emptyDescription="Find work in your projects or create a task."
              emptyAction="Browse tasks"
              emptyContent={<HomeEmptyWork organizationId={organizationId} />}
              emphasis
              link={{ to: "/tasks", search }}
              data={tasks}
            />
          </HomePanel>
          <HomePanel
            id="agents"
            active={activeSection}
            className={cn(
              "xl:row-span-2 xl:row-start-1",
              quietAttention ? "xl:col-span-5 xl:col-start-8" : "xl:col-span-4 xl:col-start-9",
            )}
          >
            <HomeSection
              title="My agents"
              icon={Bot}
              emptyTitle="No agent activity yet"
              emptyDescription="Choose an agent and connect its home desktop to start delegating work."
              emptyAction="Open agents"
              link={{ to: "/agents", search }}
              data={agents}
            />
          </HomePanel>
          <HomePanel
            id="updates"
            active={activeSection}
            className="xl:col-span-7 xl:col-start-1 xl:row-span-2 xl:row-start-6"
          >
            <HomeSection
              title="Recent updates"
              icon={Bell}
              emptyTitle="No other recent updates"
              emptyDescription="View past assignments, mentions, and replies."
              emptyAction="Open notifications"
              link={{ to: "/notifications", search }}
              data={updates}
            />
          </HomePanel>
          <HomePanel
            id="conversations"
            active={activeSection}
            className="xl:col-span-5 xl:col-start-8 xl:row-span-2 xl:row-start-3"
          >
            <HomeSection
              title="Conversations"
              description="Unread · Direct messages first"
              icon={MessageSquare}
              emptyTitle="No other unread conversations"
              emptyDescription="Open Messages to catch up on channels or start a conversation."
              emptyAction="Open messages"
              link={{ to: "/messages", search }}
              data={conversations}
            />
          </HomePanel>
          <HomePanel
            id="deals"
            active={activeSection}
            className="xl:col-span-5 xl:col-start-8 xl:row-span-3 xl:row-start-5"
          >
            <HomeSection
              title="CRM follow-ups"
              description="Your open deals · closing within 7 days or overdue"
              icon={Handshake}
              emptyTitle="No deals closing soon"
              emptyDescription="CRM follow-up tasks appear in My work."
              emptyAction="Open CRM"
              link={{ to: "/crm", search: { ...search, section: "deals" } }}
              data={deals}
            />
          </HomePanel>
        </div>
      </div>
    </div>
  );
}
