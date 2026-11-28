import { Link } from "@tanstack/react-router";

import type { ComponentProps, ReactNode } from "react";

import { CalendarAgenda } from "./calendar-agenda";
import { CalendarFilter, CalendarFilterBar } from "./calendar-filter";
import { CalendarToolbar } from "./calendar-toolbar";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { InlineNotice } from "@/components/feedback/inline-notice";
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
import type { CalendarGroup } from "@/lib/calendar/groups";
import { CalendarDays, Plus, Settings, TriangleAlert } from "lucide-react";

export type CalendarBodyState = "loading" | "error" | "no-calendars" | "ready";

function SettingsLink({ children, ...props }: Omit<ComponentProps<typeof Button>, "asChild">) {
  return (
    <Button {...props} asChild>
      <Link to="/settings/user/calendars">{children}</Link>
    </Button>
  );
}

export function CalendarWorkspaceView({
  state,
  onRetry,
  calendarGroups,
  hidden,
  onToggleCalendar,
  onHiddenChange,
  toolbar,
  needsReconnect,
  body,
  aside,
}: {
  state: CalendarBodyState;
  onRetry: () => void;
  calendarGroups: readonly CalendarGroup[];
  hidden: ReadonlySet<string>;
  onToggleCalendar: (calendarEntityId: string, visible: boolean) => void;
  onHiddenChange: (hidden: ReadonlySet<string>) => void;
  toolbar: ComponentProps<typeof CalendarToolbar>;
  needsReconnect: boolean;
  body: ReactNode;
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
        <PageSidebarContent className="max-md:max-h-48">
          {calendarGroups.length > 0 && (
            <CalendarFilter groups={calendarGroups} hidden={hidden} onToggle={onToggleCalendar} />
          )}
        </PageSidebarContent>
      </PageSidebar>
      <PageContent>
        <CalendarToolbar {...toolbar} />
        {calendarGroups.length > 0 && (
          <CalendarFilterBar
            groups={calendarGroups}
            hidden={hidden}
            onHiddenChange={onHiddenChange}
          />
        )}
        {needsReconnect && (
          <div className="shrink-0 px-4 pt-3">
            <InlineNotice
              icon={TriangleAlert}
              tone="warning"
              action={
                <SettingsLink variant="outline" size="sm">
                  Reconnect calendar
                </SettingsLink>
              }
            >
              A calendar needs to be reconnected. Its events may be out of date.
            </InlineNotice>
          </div>
        )}
        <CalendarStateBody state={state} onRetry={onRetry} body={body} />
      </PageContent>
      {aside}
    </PageLayout>
  );
}

function CalendarStateBody({
  state,
  onRetry,
  body,
}: {
  state: CalendarBodyState;
  onRetry: () => void;
  body: ReactNode;
}) {
  if (state === "error")
    return <ErrorState title="Couldn’t load your calendar" onRetry={onRetry} />;
  if (state === "loading")
    return (
      <div className="p-6">
        <LoadingState label="Loading events" rows={5} />
      </div>
    );
  if (state === "no-calendars")
    return (
      <ContentNotice
        icon={CalendarDays}
        title="No calendars connected"
        description="Connect your Google Calendar to see your meetings here. Calendars sync read-only."
        action={
          <SettingsLink>
            <Plus aria-hidden />
            Connect a calendar
          </SettingsLink>
        }
      />
    );
  return body;
}

export function CalendarAgendaBody(props: ComponentProps<typeof CalendarAgenda>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {props.days.length > 0 ? (
        <CalendarAgenda {...props} />
      ) : (
        <ContentNotice
          icon={CalendarDays}
          title="Nothing scheduled"
          description="No events in these two weeks. Hidden calendars are not shown."
        />
      )}
    </div>
  );
}
