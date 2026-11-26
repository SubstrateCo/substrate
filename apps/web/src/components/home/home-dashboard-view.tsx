import { useState, type ReactNode } from "react";

import { HomeEmptyWork } from "./home-empty-work";
import { HomeSection, type HomeSectionData } from "./home-section";
import { PageHeader } from "@/components/layout/page-header";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";
import { Bell, Bot, CheckCheck, Hand, Handshake, MessageSquare } from "lucide-react";

export type HomeDashboardViewProps = {
  organizationId: string;
  tasksEnabled?: boolean;
  crmEnabled?: boolean;
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
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 max-md:flex-none",
        active !== id && "max-md:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HomeDashboardView({
  organizationId,
  tasksEnabled = true,
  crmEnabled = true,
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
    <PageLayout id="home" aria-label="Home">
      <PageContent>
        <div
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 max-md:overflow-y-auto md:gap-6 md:p-6"
          data-home-dashboard
        >
          <PageHeader
            className="max-md:[&>div:first-child]:basis-auto"
            title="Home"
            description={date}
            actions={
              <div className="w-48 md:hidden">
                <Select value={activeSection} onValueChange={setActiveSection}>
                  <SelectTrigger className="w-full" aria-label="Dashboard section">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.flatMap(([value, label]) =>
                      (value === "tasks" && !tasksEnabled) || (value === "deals" && !crmEnabled)
                        ? []
                        : [
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>,
                          ],
                    )}
                  </SelectContent>
                </Select>
              </div>
            }
          />
          <div className="flex min-h-0 flex-1 flex-col gap-4 max-md:flex-none md:flex-row">
            <div className="flex min-h-0 min-w-0 flex-col gap-4 max-md:contents md:flex-1 xl:flex-7">
              <HomePanel
                id="attention"
                active={activeSection}
                className={quietAttention ? "md:flex-none" : "md:grow-2"}
              >
                <HomeSection
                  title="Needs your attention"
                  titleIcon={<Hand aria-hidden="true" className="size-4 text-warning" />}
                  empty={{
                    icon: CheckCheck,
                    title: "You’re caught up",
                    description: "No pending decisions or recent mentions here.",
                    action: "Open notifications",
                    link: { to: "/notifications", search },
                  }}
                  hideHeaderWhenEmpty
                  link={{ to: "/agents", search }}
                  linkLabel="Agent requests"
                  data={attention}
                />
              </HomePanel>
              {tasksEnabled && (
                <HomePanel
                  id="tasks"
                  active={activeSection}
                  className={quietAttention ? "md:grow-4" : "md:grow-3"}
                >
                  <HomeSection
                    title="My work"
                    description="Assigned to you · earliest due first"
                    empty={{ content: <HomeEmptyWork organizationId={organizationId} /> }}
                    link={{ to: "/tasks", search }}
                    data={tasks}
                  />
                </HomePanel>
              )}
              <HomePanel id="updates" active={activeSection} className="md:grow-2">
                <HomeSection
                  title="Recent updates"
                  empty={{
                    icon: Bell,
                    title: "No other recent updates",
                    description: "View past assignments, mentions, and replies.",
                    action: "Open notifications",
                  }}
                  link={{ to: "/notifications", search }}
                  data={updates}
                />
              </HomePanel>
            </div>
            <div className="flex min-h-0 min-w-0 flex-col gap-4 max-md:contents md:flex-1 xl:flex-5">
              <HomePanel id="agents" active={activeSection} className="md:grow-2">
                <HomeSection
                  title="My agents"
                  empty={{
                    icon: Bot,
                    title: "No agent activity yet",
                    description:
                      "Choose an agent and connect its home desktop to start delegating work.",
                    action: "Open agents",
                  }}
                  link={{ to: "/agents", search }}
                  data={agents}
                />
              </HomePanel>
              <HomePanel id="conversations" active={activeSection} className="md:grow-2">
                <HomeSection
                  title="Conversations"
                  description="Unread · Direct messages first"
                  empty={{
                    icon: MessageSquare,
                    title: "No other unread conversations",
                    description: "Open Messages to catch up on channels or start a conversation.",
                    action: "Open messages",
                  }}
                  link={{ to: "/messages", search }}
                  data={conversations}
                />
              </HomePanel>
              {crmEnabled && (
                <HomePanel id="deals" active={activeSection} className="md:grow-3">
                  <HomeSection
                    title="CRM follow-ups"
                    description="Your open deals · closing within 7 days or overdue"
                    empty={{
                      icon: Handshake,
                      title: "No deals closing soon",
                      description: "CRM follow-up tasks appear in My work.",
                      action: "Open CRM",
                    }}
                    link={{ to: "/crm", search: { ...search, section: "deals" } }}
                    data={deals}
                  />
                </HomePanel>
              )}
            </div>
          </div>
        </div>
      </PageContent>
    </PageLayout>
  );
}
