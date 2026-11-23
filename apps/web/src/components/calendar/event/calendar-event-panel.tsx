import { useQuery } from "@tanstack/react-query";

import { useEffect, useRef } from "react";

import { CalendarEventDetail } from "./calendar-event-detail";
import { isAccessFailure } from "@/api/access-failure";
import { CopyLink } from "@/components/context/links/copy-link";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageAside, useAsideCovers } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { eventDate } from "@/lib/calendar/days";
import { calendarLink } from "@/lib/navigation/record-links";
import { calendarEventOptions } from "@/queries/calendar/options";
import { Unlink, X } from "lucide-react";

/** The side pane for one event, opened from the calendar and named in its URL. */
export function CalendarEventPanel({
  organizationId,
  eventId,
  now,
  onClose,
}: {
  organizationId: string;
  eventId: string;
  now: number;
  onClose: () => void;
}) {
  const query = useQuery(calendarEventOptions(organizationId, eventId));
  const close = useRef<HTMLButtonElement>(null);
  const covers = useAsideCovers();
  useEffect(() => {
    if (covers) close.current?.focus();
  }, [covers]);
  const event = query.data;
  return (
    <PageAside aria-label="Event details">
      <PageHeader
        variant="pane"
        title="Event"
        actions={
          <div role="group" aria-label="Event tools" className="flex gap-0.5">
            {event && (
              <CopyLink
                grouped
                link={calendarLink(organizationId, event.entityId, eventDate(event))}
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={close}
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close event"
                  onClick={onClose}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close event</TooltipContent>
            </Tooltip>
          </div>
        }
      />
      {query.error && isAccessFailure(query.error) && (
        <ContentNotice
          icon={Unlink}
          title="Event unavailable"
          description="This event was removed, or it belongs to a calendar you can’t open."
        />
      )}
      {query.error && !isAccessFailure(query.error) && (
        <ErrorState title="Couldn’t load this event" onRetry={() => void query.refetch()} />
      )}
      {!query.error && !event && (
        <div className="p-4">
          <LoadingState label="Loading event…" variant="compact" />
        </div>
      )}
      {!query.error && event && (
        <CalendarEventDetail organizationId={organizationId} event={event} now={now} />
      )}
    </PageAside>
  );
}
