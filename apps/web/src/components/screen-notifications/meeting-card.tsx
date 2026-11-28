import type {
  MeetingNotification,
  ScreenNotificationAction,
} from "@substrate/contracts/desktop/screen-notifications-ipc";

import { CalendarColorDot } from "@/components/calendar/calendar-color";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-now";
import { meetingTiming } from "@/lib/screen-notifications/meeting-labels";
import { cn } from "cn";
import { Video, X } from "lucide-react";

export function MeetingCard({
  notification,
  onAction,
}: {
  notification: MeetingNotification;
  onAction: (action: ScreenNotificationAction) => void;
}) {
  const { payload } = notification;
  const now = useNow(true, 15_000);
  const timing = meetingTiming(payload, now);
  const started = timing.phase === "started";
  const can = (action: ScreenNotificationAction) => notification.actions.includes(action);
  const meta = [timing.range, payload.calendarName].filter(Boolean).join(" · ");
  return (
    <div role="status" className="flex w-full min-w-0 items-start gap-3">
      <span className="flex h-5 shrink-0 items-center">
        <CalendarColorDot
          color={payload.color}
          className={cn(started && "ring-3 ring-(--calendar-color)/25")}
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p
          className="truncate text-sm font-medium max-sm:wrap-anywhere max-sm:whitespace-normal"
          title={payload.title}
        >
          {payload.title}
        </p>
        <p className="truncate text-sm text-muted-foreground max-sm:wrap-anywhere max-sm:whitespace-normal">
          <span className={cn(started && "font-medium text-primary")}>{timing.relative}</span>
          {meta && ` · ${meta}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 max-sm:-mr-8">
          {payload.joinable && can("join") && (
            <Button type="button" size="sm" onClick={() => onAction("join")}>
              <Video aria-hidden="true" />
              Join
            </Button>
          )}
          {can("open") && (
            <Button type="button" size="sm" variant="outline" onClick={() => onAction("open")}>
              Open
            </Button>
          )}
          {can("snooze") && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onAction("snooze")}>
              Snooze
            </Button>
          )}
        </div>
      </div>
      {can("dismiss") && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute top-2 right-2"
              aria-label="Dismiss"
              onClick={() => onAction("dismiss")}
            >
              <X aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          {/* The card sits against the screen's right edge, so the tooltip opens inward, over the
              card. Sonner's list has z-index 999999999; the tooltip's later portal wins the tie. */}
          <TooltipContent side="left" className="z-999999999">
            Dismiss
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
