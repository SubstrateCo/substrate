import { Link, useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { InteractionDashboard } from "./interaction-dashboard";
import { InteractionDirectory } from "./interaction-directory";
import { interactionWindow } from "./interaction-period";
import { InteractionProfile } from "./interaction-profile";
import { InteractionRecordDialog } from "./interaction-record-dialog";
import { InteractionTimeline } from "./interaction-timeline";
import type { InteractionSection } from "./interaction-types";
import { NewInteraction } from "./new-interaction";
import { ContentNotice } from "@/components/feedback/content-notice";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import {
  PageContent,
  PageLayout,
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { Building2, LayoutDashboard, Plus, Users } from "lucide-react";

const sections = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "people", label: "People", icon: Users },
  { value: "accounts", label: "Organizations", icon: Building2 },
] as const;
const titles: Record<InteractionSection, string> = {
  dashboard: "Interaction dashboard",
  timeline: "Interaction timeline",
  people: "People",
  accounts: "Organizations",
  person: "Contact activity",
  account: "Organization activity",
};

export function InteractionsWorkspace({
  organizationId,
  section,
  days,
  profileId,
  recordId,
  tab,
}: {
  organizationId: string;
  section: InteractionSection;
  days: "7" | "30" | "all";
  profileId?: string;
  recordId?: string;
  tab?: "activity" | "map";
}) {
  const navigate = useNavigate({ from: "/interactions/" });
  const apps = useOrganizationApps();
  const [creating, setCreating] = useState(false);
  const activeDays = section === "dashboard" && days === "all" ? "30" : days;
  const { period, dates } = interactionWindow(
    organizationId,
    activeDays === "all" ? 30 : Number(activeDays),
  );
  const filter = { ...period, allTime: activeDays === "all" ? ("true" as const) : undefined };
  let directorySection: InteractionSection = section;
  if (section === "person") directorySection = "people";
  if (section === "account") directorySection = "accounts";
  function content() {
    if ((section === "accounts" || section === "account") && !apps.enabled("crm"))
      return (
        <ContentNotice
          title="CRM is unavailable"
          description="Enable CRM in workspace settings to view organization activity."
          icon={Building2}
        />
      );
    if (section === "dashboard")
      return (
        <InteractionDashboard
          key={activeDays}
          period={period}
          dates={dates}
          days={activeDays === "7" ? "7" : "30"}
        />
      );
    if (section === "timeline") return <InteractionTimeline key={activeDays} period={filter} />;
    if (section === "people" || section === "accounts")
      return (
        <InteractionDirectory key={`${section}:${activeDays}`} period={filter} type={section} />
      );
    if (!profileId)
      return (
        <ContentNotice
          title="Select a record"
          description="Choose a person or organization from the directory."
        />
      );
    return (
      <InteractionProfile
        key={`${profileId}:${activeDays}`}
        organizationId={organizationId}
        entityId={profileId}
        type={section === "person" ? "person" : "account"}
        period={filter}
        tab={tab ?? "activity"}
      />
    );
  }
  return (
    <PageLayout id="interactions" aria-label="Interactions workspace">
      <PageSidebar aria-label="Interactions">
        <PageSidebarHeader title="Interactions" />
        <PageSidebarContent>
          <nav aria-label="Interactions views">
            <ul className="flex gap-0.5 md:flex-col">
              {sections.map(({ value, label, icon: Icon }) =>
                value === "accounts" && !apps.enabled("crm") ? null : (
                  <li key={value}>
                    <Button variant="sidebar" className="w-full justify-start" asChild>
                      <Link
                        to="/interactions"
                        search={{
                          workspaceId: organizationId,
                          section: value,
                          days: value === "dashboard" && days === "all" ? "30" : days,
                        }}
                        aria-current={directorySection === value ? "page" : undefined}
                      >
                        <Icon aria-hidden className="text-muted-foreground" />
                        {label}
                      </Link>
                    </Button>
                  </li>
                ),
              )}
            </ul>
          </nav>
        </PageSidebarContent>
      </PageSidebar>
      <PageContent className="@container">
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 overflow-hidden p-6">
          <PageHeader
            title={titles[section]}
            actions={
              <>
                <SegmentedControl
                  aria-label="Activity period"
                  value={activeDays}
                  options={
                    section === "dashboard"
                      ? [
                          { value: "7", label: "Last 7 days" },
                          { value: "30", label: "Last 30 days" },
                        ]
                      : [
                          { value: "7", label: "Last 7 days" },
                          { value: "30", label: "Last 30 days" },
                          { value: "all", label: "All time" },
                        ]
                  }
                  onValueChange={(value) =>
                    void navigate({
                      to: "/interactions",
                      search: (previous) => ({ ...previous, days: value }),
                    })
                  }
                />
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus aria-hidden />
                  New interaction
                </Button>
              </>
            }
          />
          {content()}
        </div>
      </PageContent>
      {creating && (
        <NewInteraction
          organizationId={organizationId}
          contactId={section === "person" ? profileId : undefined}
          onClose={() => setCreating(false)}
        />
      )}
      {recordId && (
        <InteractionRecordDialog
          organizationId={organizationId}
          entityId={recordId}
          onClose={() =>
            void navigate({
              to: "/interactions",
              search: (previous) => ({ ...previous, recordId: undefined }),
            })
          }
        />
      )}
    </PageLayout>
  );
}
