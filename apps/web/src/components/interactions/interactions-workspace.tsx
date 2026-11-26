import { Link, useNavigate } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";

import { InteractionDashboard } from "./interaction-dashboard";
import { InteractionDetail } from "./interaction-detail";
import { InteractionDirectory } from "./interaction-directory";
import { interactionWindow } from "./interaction-period";
import { InteractionProfile } from "./interaction-profile";
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
  SidebarNav,
} from "@/components/layout/page-layout";
import { PageSheet } from "@/components/layout/page-sheet";
import { Button } from "@/components/ui/button";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { Building2, LayoutDashboard, Plus, Users } from "lucide-react";

type Days = "7" | "30" | "all";

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

/** The dashboard has no all-time view, so it shows the last 30 days instead. */
function sectionDays(section: InteractionSection, days: Days) {
  return section === "dashboard" && days === "all" ? "30" : days;
}

/** The directory section that a profile belongs to. */
function directorySectionOf(section: InteractionSection): InteractionSection {
  if (section === "person") return "people";
  if (section === "account") return "accounts";
  return section;
}

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
  days: Days;
  profileId?: string;
  recordId?: string;
  tab?: "activity" | "map";
}) {
  const navigate = useNavigate({ from: "/interactions/" });
  const apps = useOrganizationApps();
  const [creating, setCreating] = useState(false);
  const activeDays = sectionDays(section, days);
  const crmUnavailable = (section === "accounts" || section === "account") && !apps.enabled("crm");
  // A profile renders its own header, with the record's name as the title.
  const showsProfile =
    !crmUnavailable && !!profileId && (section === "person" || section === "account");
  const createButton = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      New interaction
    </Button>
  );
  const periodControl = (
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
  );
  return (
    <PageLayout id="interactions" aria-label="Interactions workspace">
      <PageSidebar aria-label="Interactions">
        <PageSidebarHeader title="Interactions" />
        <PageSidebarContent>
          <SidebarNav
            label="Interactions views"
            items={sections.flatMap(({ value, label, icon }) =>
              value === "accounts" && !apps.enabled("crm")
                ? []
                : {
                    key: value,
                    label,
                    icon,
                    link: {
                      to: "/interactions",
                      search: {
                        workspaceId: organizationId,
                        section: value,
                        days: sectionDays(value, days),
                      },
                    },
                    current: directorySectionOf(section) === value,
                  },
            )}
          />
        </PageSidebarContent>
      </PageSidebar>
      <PageContent className="@container">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
          {!showsProfile && <PageHeader title={titles[section]} actions={createButton} />}
          {crmUnavailable ? (
            <ContentNotice
              title="CRM is unavailable"
              description="Enable CRM in workspace settings to view organization activity."
              icon={Building2}
            />
          ) : (
            <InteractionsContent
              organizationId={organizationId}
              section={section}
              activeDays={activeDays}
              profileId={profileId}
              tab={tab}
              periodControl={periodControl}
              createButton={createButton}
            />
          )}
        </div>
      </PageContent>
      {creating && (
        <NewInteraction
          organizationId={organizationId}
          contactId={section === "person" ? profileId : undefined}
          onClose={() => setCreating(false)}
        />
      )}
      <InteractionRecordSheet organizationId={organizationId} recordId={recordId} />
    </PageLayout>
  );
}

/** The view for the current section, once CRM access is settled. */
function InteractionsContent({
  organizationId,
  section,
  activeDays,
  profileId,
  tab,
  periodControl,
  createButton,
}: {
  organizationId: string;
  section: InteractionSection;
  activeDays: Days;
  profileId?: string;
  tab?: "activity" | "map";
  periodControl: ReactNode;
  createButton: ReactNode;
}) {
  const { period, dates } = interactionWindow(
    organizationId,
    activeDays === "all" ? 30 : Number(activeDays),
  );
  const filter = { ...period, allTime: activeDays === "all" ? ("true" as const) : undefined };
  if (section === "dashboard")
    return (
      <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">
        <div className="flex shrink-0 flex-wrap items-center gap-2">{periodControl}</div>
        <InteractionDashboard
          key={activeDays}
          period={period}
          dates={dates}
          days={activeDays === "7" ? "7" : "30"}
        />
      </div>
    );
  if (section === "timeline")
    return <InteractionTimeline key={activeDays} period={filter} filters={periodControl} />;
  if (section === "people" || section === "accounts")
    return (
      <InteractionDirectory
        key={`${section}:${activeDays}`}
        period={filter}
        type={section}
        filters={periodControl}
      />
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
      periodControl={periodControl}
      createAction={createButton}
    />
  );
}

function InteractionRecordSheet({
  organizationId,
  recordId,
}: {
  organizationId: string;
  recordId?: string;
}) {
  const navigate = useNavigate({ from: "/interactions/" });
  return (
    <PageSheet
      open={!!recordId}
      label="Interaction"
      onOpenChange={(open) => {
        if (!open)
          void navigate({
            to: "/interactions",
            search: (previous) => ({ ...previous, recordId: undefined }),
          });
      }}
    >
      {recordId && (
        <InteractionDetail
          key={recordId}
          organizationId={organizationId}
          entityId={recordId}
          contact={(contact) => (
            <Link
              from="/interactions/"
              to="/interactions"
              search={(previous) => ({
                ...previous,
                section: "person",
                profileId: contact.entityId,
                recordId: undefined,
                // The record can be older than the current period.
                days: "all",
              })}
              className="min-w-0 truncate underline-offset-4 hover:underline"
            >
              {contact.name}
            </Link>
          )}
        />
      )}
    </PageSheet>
  );
}
