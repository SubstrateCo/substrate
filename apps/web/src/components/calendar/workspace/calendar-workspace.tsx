import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { linkOptions, useNavigate } from "@tanstack/react-router";

import { useState, type ComponentProps } from "react";

import { CalendarEventPanel } from "../event/calendar-event-panel";
import { CalendarMonth } from "./calendar-month";
import { CalendarWeek } from "./calendar-week";
import {
  CalendarAgendaBody,
  CalendarWorkspaceView,
  type CalendarBodyState,
} from "./calendar-workspace-view";
import { isCalendarAccessRequired } from "@/api/calendar/access";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useNow } from "@/hooks/use-now";
import {
  eventRange,
  groupEventsByDay,
  shiftAnchor,
  startOfDay,
  viewAnchor,
  visibleDays,
  type CalendarViewMode,
} from "@/lib/calendar/days";
import { groupCalendarsByAccount } from "@/lib/calendar/groups";
import { readCalendarView, saveCalendarView } from "@/lib/calendar/view-preference";
import { formatDateOnly, formatDateRange, formatMonthYear } from "@/lib/format/date";
import { calendarEventsOptions, calendarSettingsOptions } from "@/queries/calendar/options";

export function CalendarWorkspace({
  view: requestedView,
  date,
  eventId,
}: {
  view?: CalendarViewMode;
  /** YYYY-MM-DD of the day the view is anchored to. Today when absent. */
  date?: string;
  eventId?: string;
}) {
  const { organizationId } = useWorkspaceScope();
  const navigate = useNavigate({ from: "/calendar/" });
  const [preferredView, setPreferredView] = useState(readCalendarView);
  const view = requestedView ?? preferredView;
  const now = useNow(true, 60_000);
  const anchor = viewAnchor(date, new Date(now));
  const days = visibleDays(view, anchor);
  const range = eventRange(days);
  const settings = useQuery(calendarSettingsOptions(organizationId));
  const events = useQuery({
    ...calendarEventsOptions(organizationId, range),
    placeholderData: keepPreviousData,
  });
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const calendarGroups = settings.data ? groupCalendarsByAccount(settings.data) : [];
  // A missing calendar grant reads as a reconnect banner over an empty calendar, not an error.
  const accessRequired = isCalendarAccessRequired(events.error);
  const needsReconnect =
    accessRequired ||
    (settings.data?.accounts.some(
      (account) =>
        (!account.hasCalendarAccess && account.calendars.length > 0) ||
        account.calendars.some((calendar) => calendar.syncStatus === "reauth_required"),
    ) ??
      false);
  let state: CalendarBodyState = "ready";
  if (settings.error || (events.error && !accessRequired)) state = "error";
  else if (!settings.data || (!events.data && !accessRequired)) state = "loading";
  else if (calendarGroups.length === 0) state = "no-calendars";
  const visible = (events.data ?? []).filter((event) => !hidden.has(event.calendarEntityId));
  const today = startOfDay(new Date(now));
  const showsToday = days.some((day) => day.getTime() === today.getTime());
  const search = (next: { view?: CalendarViewMode; date?: string; eventId?: string }) =>
    void navigate({ to: "/calendar", search: (previous) => ({ ...previous, ...next }) });
  // The open event lives in the URL, so the pane is linkable and Back closes it.
  const eventLink = (event: CalendarEventSummary) =>
    linkOptions({
      to: "/calendar",
      search: { workspaceId: organizationId, view, date, eventId: event.entityId },
    });
  const titleDate = view === "week" ? days[3]! : anchor;
  return (
    <CalendarWorkspaceView
      state={state}
      onRetry={() => {
        void settings.refetch();
        void events.refetch();
      }}
      calendarGroups={calendarGroups}
      hidden={hidden}
      onToggleCalendar={(calendarEntityId, show) =>
        setHidden((current) => {
          const next = new Set(current);
          if (show) next.delete(calendarEntityId);
          else next.add(calendarEntityId);
          return next;
        })
      }
      onHiddenChange={setHidden}
      toolbar={{
        title:
          view !== "agenda"
            ? formatMonthYear(titleDate)
            : formatDateRange(days[0]!, days.at(-1)!, now),
        view,
        showsToday,
        onToday: () => search({ date: undefined }),
        onStep: (direction) => search({ date: shiftAnchor(view, anchor, direction) }),
        onViewChange: (next) => {
          saveCalendarView(next);
          setPreferredView(next);
          search({ view: next, date: date ? formatDateOnly(anchor) : undefined });
        },
      }}
      needsReconnect={needsReconnect}
      body={
        <CalendarBody
          view={view}
          days={days}
          events={visible}
          now={now}
          today={showsToday ? today : undefined}
          selectedEventId={eventId}
          eventLink={eventLink}
        />
      }
      aside={
        eventId && (
          <CalendarEventPanel
            key={eventId}
            eventId={eventId}
            now={now}
            onClose={() => search({ eventId: undefined })}
          />
        )
      }
    />
  );
}

/** The week, month, or agenda of the visible events. */
function CalendarBody({
  view,
  today,
  ...grid
}: ComponentProps<typeof CalendarWeek> & {
  view: CalendarViewMode;
  /** Today, when the visible days include it. */
  today: Date | undefined;
}) {
  if (view === "week") return <CalendarWeek {...grid} />;
  if (view === "month") return <CalendarMonth {...grid} />;
  return (
    <CalendarAgendaBody
      days={groupEventsByDay(grid.events, grid.days, today)}
      now={grid.now}
      selectedEventId={grid.selectedEventId}
      eventLink={grid.eventLink}
    />
  );
}
