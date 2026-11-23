import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { Link, type LinkProps } from "@tanstack/react-router";

import type { ComponentProps, ReactNode } from "react";

import { ReconnectNotice } from "../reconnect-notice";
import { CalendarAgenda } from "./calendar-agenda";
import { CalendarFilter } from "./calendar-filter";
import { CalendarToolbar } from "./calendar-toolbar";
import { CalendarWeek } from "./calendar-week";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import {
  PageContent,
  PageLayout,
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AgendaDay, CalendarViewMode } from "@/lib/calendar/days";
import type { CalendarGroup } from "@/lib/calendar/groups";
import { CalendarDays, Settings } from "lucide-react";

export type CalendarBodyState = "loading" | "error" | "no-calendars" | "ready";

function SettingsLink({ children, ...props }: Omit<ComponentProps<typeof Button>, "asChild">) {
  return (
    <Button {...props} asChild>
      <Link to="/settings/user/calendars">{children}</Link>
    </Button>
  );
}

/** The Calendar app: calendars to show on the left, the agenda or week in the middle. */
export function CalendarWorkspaceView({
  state,
  onRetry,
  calendarGroups,
  hidden,
  onToggleCalendar,
  toolbar,
  needsReconnect,
  view,
  weekDays,
  agenda,
  events,
  now,
  selectedEventId,
  eventLink,
  aside,
}: {
  state: CalendarBodyState;
  onRetry: () => void;
  calendarGroups: readonly CalendarGroup[];
  hidden: ReadonlySet<string>;
  onToggleCalendar: (calendarEntityId: string, visible: boolean) => void;
  toolbar: ComponentProps<typeof CalendarToolbar>;
  /** A connected calendar needs the user to grant access again. */
  needsReconnect: boolean;
  view: CalendarViewMode;
  weekDays: readonly Date[];
  agenda: readonly AgendaDay[];
  events: readonly CalendarEventSummary[];
  now: number;
  selectedEventId?: string;
  eventLink: (event: CalendarEventSummary) => LinkProps;
  /** The open event's pane. */
  aside?: ReactNode;
}) {
  return (
    <PageLayout id="calendar" aria-label="Calendar">
      <PageSidebar aria-label="Calendar">
        <PageSidebarHeader
          title="Calendar"
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <SettingsLink variant="ghost" size="icon-sm" aria-label="Calendar settings">
                  <Settings />
                </SettingsLink>
              </TooltipTrigger>
              <TooltipContent>Calendar settings</TooltipContent>
            </Tooltip>
          }
        />
        <PageSidebarContent>
          {calendarGroups.length > 0 && (
            <CalendarFilter groups={calendarGroups} hidden={hidden} onToggle={onToggleCalendar} />
          )}
        </PageSidebarContent>
      </PageSidebar>
      <PageContent>
        <CalendarToolbar {...toolbar} />
        {needsReconnect && (
          <div className="shrink-0 px-4 pt-3">
            <ReconnectNotice
              action={
                <SettingsLink variant="outline" size="sm">
                  Reconnect calendar
                </SettingsLink>
              }
            >
              A calendar needs to be reconnected. Its events may be out of date.
            </ReconnectNotice>
          </div>
        )}
        {state === "error" && (
          <ErrorState
            title="Couldn’t load your calendar"
            description="Try again to see your events."
            onRetry={onRetry}
          />
        )}
        {state === "loading" && (
          <div className="p-6">
            <LoadingState label="Loading events…" rows={5} />
          </div>
        )}
        {state === "no-calendars" && (
          <ContentNotice
            icon={CalendarDays}
            title="No calendars connected"
            description="Connect your Google Calendar to see your meetings here. Calendars sync read-only."
            action={<SettingsLink>Connect a calendar</SettingsLink>}
          />
        )}
        {state === "ready" && view === "week" && (
          <CalendarWeek
            days={weekDays}
            events={events}
            now={now}
            selectedEventId={selectedEventId}
            eventLink={eventLink}
          />
        )}
        {state === "ready" && view === "agenda" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {agenda.length > 0 ? (
              <CalendarAgenda
                days={agenda}
                now={now}
                selectedEventId={selectedEventId}
                eventLink={eventLink}
              />
            ) : (
              <ContentNotice
                icon={CalendarDays}
                title="Nothing scheduled"
                description="No events in these two weeks. Hidden calendars are not shown."
              />
            )}
          </div>
        )}
      </PageContent>
      {aside}
    </PageLayout>
  );
}
