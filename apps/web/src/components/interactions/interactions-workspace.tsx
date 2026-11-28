import { useNavigate } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";

import { InteractionDashboard } from "./interaction-dashboard";
import { InteractionDetail } from "./interaction-detail";
import { InteractionDirectory } from "./interaction-directory";
import { loggedByField, periodField } from "./interaction-filter-fields";
import {
  interactionFiltersFrom,
  interactionFilterValue,
  type InteractionDays,
  type InteractionLoggedBy,
} from "./interaction-filters";
import { ContactProfileLink } from "./interaction-link";
import { interactionWindow } from "./interaction-period";
import { InteractionProfile } from "./interaction-profile";
import { InteractionTimeline } from "./interaction-timeline";
import type { InteractionSection } from "./interaction-types";
import { NewInteraction } from "./new-interaction";
import { useSourceCalendarField } from "./use-source-calendar-field";
import { ContentNotice } from "@/components/feedback/content-notice";
import { FilterBar } from "@/components/filters";
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
import { usePanelReturn } from "@/components/layout/use-panel-return";
import { Button } from "@/components/ui/button";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
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

function sectionDays(section: InteractionSection, days: InteractionDays) {
  return section === "dashboard" && days === "all" ? "30" : days;
}

function directorySectionOf(section: InteractionSection): InteractionSection {
  if (section === "person") return "people";
  if (section === "account") return "accounts";
  return section;
}

export function InteractionsWorkspace({
  section,
  days,
  loggedBy,
  sourceCalendarEntityId,
  profileId,
  recordId,
  tab,
}: {
  section: InteractionSection;
  days: InteractionDays;
  loggedBy: InteractionLoggedBy;
  sourceCalendarEntityId?: string;
  profileId?: string;
  recordId?: string;
  tab?: "activity" | "map";
}) {
  const { organizationId } = useWorkspaceScope();
  const navigate = useNavigate({ from: "/interactions/" });
  const apps = useOrganizationApps();
  const [creating, setCreating] = useState(false);
  const activeDays = sectionDays(section, days);
  const crmUnavailable = (section === "accounts" || section === "account") && !apps.enabled("crm");
  const showsProfile =
    !crmUnavailable && !!profileId && (section === "person" || section === "account");
  const createButton = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      New interaction
    </Button>
  );
  const setDays = (value: InteractionDays) =>
    void navigate({
      to: "/interactions",
      search: (previous) => ({ ...previous, days: value }),
    });
  const setLoggedBy = (value: InteractionLoggedBy) =>
    void navigate({
      to: "/interactions",
      search: (previous) => ({ ...previous, loggedBy: value }),
    });
  const setSourceCalendar = (value?: string) =>
    void navigate({
      to: "/interactions",
      search: (previous) => ({ ...previous, sourceCalendarEntityId: value }),
    });
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
                        loggedBy,
                        sourceCalendarEntityId,
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
              section={section}
              activeDays={activeDays}
              loggedBy={loggedBy}
              sourceCalendarEntityId={sourceCalendarEntityId}
              onSourceCalendarChange={setSourceCalendar}
              profileId={profileId}
              tab={tab}
              onDaysChange={setDays}
              onLoggedByChange={setLoggedBy}
              createButton={createButton}
            />
          )}
        </div>
      </PageContent>
      {creating && (
        <NewInteraction
          contactId={section === "person" ? profileId : undefined}
          onClose={() => setCreating(false)}
        />
      )}
      <InteractionRecordSheet recordId={recordId} />
    </PageLayout>
  );
}

function InteractionsContent({
  section,
  activeDays,
  loggedBy,
  sourceCalendarEntityId,
  onSourceCalendarChange,
  profileId,
  tab,
  onDaysChange,
  onLoggedByChange,
  createButton,
}: {
  section: InteractionSection;
  activeDays: InteractionDays;
  loggedBy: InteractionLoggedBy;
  sourceCalendarEntityId?: string;
  onSourceCalendarChange: (value?: string) => void;
  profileId?: string;
  tab?: "activity" | "map";
  onDaysChange: (days: InteractionDays) => void;
  onLoggedByChange: (loggedBy: InteractionLoggedBy) => void;
  createButton: ReactNode;
}) {
  const { organizationId } = useWorkspaceScope();
  const calendarFields = useSourceCalendarField();
  const { period, dates } = interactionWindow(
    organizationId,
    activeDays === "all" ? 30 : Number(activeDays),
  );
  const sourcePeriod = { ...period, sourceCalendarEntityId };
  const filter = { ...sourcePeriod, allTime: activeDays === "all" ? ("true" as const) : undefined };
  const mine = loggedBy === "me" ? ("me" as const) : undefined;
  if (section === "dashboard") {
    const current = { days: activeDays, loggedBy, sourceCalendarEntityId };
    return (
      <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <FilterBar
            aria-label="Dashboard filters"
            fields={[periodField({ allTime: false }), loggedByField, ...calendarFields]}
            value={interactionFilterValue(current)}
            onValueChange={(value) => {
              const next = interactionFiltersFrom(value, current);
              if (next.days !== activeDays) onDaysChange(next.days);
              else if (next.loggedBy && next.loggedBy !== loggedBy) onLoggedByChange(next.loggedBy);
              else if (next.sourceCalendarEntityId !== sourceCalendarEntityId)
                onSourceCalendarChange(next.sourceCalendarEntityId);
            }}
          />
        </div>
        <InteractionDashboard
          key={`${activeDays}:${loggedBy}:${sourceCalendarEntityId}`}
          period={{ ...sourcePeriod, loggedBy: mine }}
          dates={dates}
          days={activeDays === "7" ? "7" : "30"}
          onShowEveryone={() => onLoggedByChange("anyone")}
        />
      </div>
    );
  }
  if (section === "timeline")
    return (
      <InteractionTimeline
        key={activeDays}
        period={{ ...filter, loggedBy: mine }}
        days={activeDays}
        onDaysChange={onDaysChange}
        loggedBy={loggedBy}
        onSourceCalendarChange={onSourceCalendarChange}
        onLoggedByChange={onLoggedByChange}
      />
    );
  if (section === "people" || section === "accounts")
    return (
      <InteractionDirectory
        key={`${section}:${activeDays}`}
        period={filter}
        days={activeDays}
        onDaysChange={onDaysChange}
        type={section}
        onSourceCalendarChange={onSourceCalendarChange}
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
      entityId={profileId}
      type={section === "person" ? "person" : "account"}
      period={filter}
      tab={tab ?? "activity"}
      days={activeDays}
      onDaysChange={onDaysChange}
      createAction={createButton}
      onSourceCalendarChange={onSourceCalendarChange}
    />
  );
}

function InteractionRecordSheet({ recordId }: { recordId?: string }) {
  const dismiss = usePanelReturn();
  return (
    <PageSheet
      open={!!recordId}
      label="Interaction"
      onOpenChange={(open) => {
        if (!open) dismiss({ recordId: undefined });
      }}
    >
      {recordId && (
        <InteractionDetail
          key={recordId}
          entityId={recordId}
          renderContact={(contact) => (
            <ContactProfileLink
              contactEntityId={contact.entityId}
              allTime
              className="min-w-0 truncate underline-offset-4 hover:underline"
            >
              {contact.name}
            </ContactProfileLink>
          )}
        />
      )}
    </PageSheet>
  );
}
