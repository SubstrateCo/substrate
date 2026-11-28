import type { CalendarEventDetail as CalendarEventDetailData } from "@substrate/contracts/calendar";

import { useQuery } from "@tanstack/react-query";

import { CalendarEventDetail } from "./calendar-event-detail";
import { CopyLink } from "@/components/context/links/copy-link";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { PageSheet, PageSheetBody, PageSheetHeader } from "@/components/layout/page-sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { eventDate } from "@/lib/calendar/days";
import { providerLabels } from "@/lib/calendar/labels";
import { calendarLink } from "@/lib/navigation/record-links";
import { resourceState, type ResourceState } from "@/lib/resource-state";
import { calendarEventOptions } from "@/queries/calendar/options";
import { ArrowUpRight, Unlink } from "lucide-react";

/**
 * The sheet for one event, opened from the calendar and named in its URL. Keep it mounted so the
 * sheet can finish its exit motion.
 */
export function CalendarEventPanel({
  eventId,
  now,
  onClose,
}: {
  eventId: string | undefined;
  now: number;
  onClose: () => void;
}) {
  return (
    <PageSheet
      open={Boolean(eventId)}
      label="Event"
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {eventId && <CalendarEventSheetContent key={eventId} eventId={eventId} now={now} />}
    </PageSheet>
  );
}

function CalendarEventSheetContent({ eventId, now }: { eventId: string; now: number }) {
  const { organizationId } = useWorkspaceScope();
  const query = useQuery(calendarEventOptions(organizationId, eventId));
  // Lost access redacts the cached event, so its link and provider link go with it.
  const state = resourceState(query);
  const event = state.data;
  return (
    <>
      <PageSheetHeader
        title="Event"
        actions={
          <>
            {event && (
              <CopyLink
                grouped
                link={calendarLink(organizationId, event.entityId, eventDate(event))}
              />
            )}
            {event?.htmlLink && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={event.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open in ${providerLabels[event.provider]} Calendar`}
                    >
                      <ArrowUpRight aria-hidden="true" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{`Open in ${providerLabels[event.provider]} Calendar`}</TooltipContent>
              </Tooltip>
            )}
          </>
        }
      />
      <EventPanelBody state={state} now={now} onRetry={() => void query.refetch()} />
    </>
  );
}

function EventPanelBody({
  state,
  now,
  onRetry,
}: {
  state: ResourceState<CalendarEventDetailData>;
  now: number;
  onRetry: () => void;
}) {
  if (state.status === "unavailable")
    return (
      <PageSheetBody className="flex flex-col">
        <ContentNotice
          icon={Unlink}
          title="Event unavailable"
          description="This event was removed, or it belongs to a calendar you can’t open."
        />
      </PageSheetBody>
    );
  if (state.status === "error")
    return (
      <PageSheetBody className="flex flex-col">
        <ErrorState title="Couldn’t load this event" onRetry={onRetry} />
      </PageSheetBody>
    );
  if (!state.data)
    return (
      <PageSheetBody>
        <LoadingState label="Loading event" variant="compact" />
      </PageSheetBody>
    );
  return (
    <>
      {state.status === "stale" && (
        <StaleNotice className="px-4 pt-4" title="Couldn’t load this event" onRetry={onRetry} />
      )}
      <CalendarEventDetail event={state.data} now={now} />
    </>
  );
}
