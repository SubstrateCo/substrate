import type { CalendarView } from "@substrate/contracts/calendar";

import { useId } from "react";

import { CalendarColorDot } from "../calendar-color";
import { CalendarStatusTag } from "../calendar-status-tag";
import { Tag } from "@/components/feedback/tag";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { calendarActions, lastSyncedLabel } from "@/lib/calendar/labels";
import { formatFullTimestamp } from "@/lib/format/date";
import { Ellipsis, History, Pause, Play, RotateCcw, Unlink } from "lucide-react";

export interface CalendarRowActions {
  onRecordsInteractions: (calendar: CalendarView, value: boolean) => void;
  onPause: (calendar: CalendarView, paused: boolean) => void;
  onBackfill: (calendar: CalendarView) => void;
  onDisconnect: (calendar: CalendarView) => void;
  onReconnect: (calendar: CalendarView) => void;
}

/** One connected calendar: its name and state on the left, its settings on the right. */
export function CalendarRow({
  calendar,
  now,
  pending,
  actions,
}: {
  calendar: CalendarView;
  now: number;
  /** A change to this calendar is saving. */
  pending: boolean;
  /** Detached calendars have none and only show their history. */
  actions?: CalendarRowActions;
}) {
  return (
    <Item asChild size="xs">
      <li>
        <ItemContent className="min-w-0 basis-56">
          <ItemTitle className="max-w-full">
            <CalendarColorDot color={calendar.color} />
            <span className="truncate" title={calendar.name}>
              {calendar.name}
            </span>
            {calendar.isPrimary && <Tag>Primary</Tag>}
          </ItemTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CalendarStatusTag status={calendar.syncStatus} />
            <span
              title={calendar.lastSyncedAt ? formatFullTimestamp(calendar.lastSyncedAt) : undefined}
            >
              {lastSyncedLabel(calendar.lastSyncedAt, now)}
            </span>
          </div>
        </ItemContent>
        {actions && <CalendarRowControls calendar={calendar} pending={pending} actions={actions} />}
      </li>
    </Item>
  );
}

/** A disconnected calendar can only be reconnected; a connected one has its switch and menu. */
function CalendarRowControls({
  calendar,
  pending,
  actions,
}: {
  calendar: CalendarView;
  pending: boolean;
  actions: CalendarRowActions;
}) {
  const id = useId();
  const allowed = calendarActions(calendar);
  if (calendar.syncStatus === "disconnected") {
    if (!allowed.reconnect) return null;
    return (
      <ItemActions className="max-w-full min-w-0 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => actions.onReconnect(calendar)}
        >
          <RotateCcw aria-hidden />
          Reconnect
        </Button>
      </ItemActions>
    );
  }
  return (
    <ItemActions className="max-w-full min-w-0 flex-wrap">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Label variant="caption" className="min-w-0" htmlFor={`${id}-interactions`}>
          Create contacts and interactions
        </Label>
        <Switch
          id={`${id}-interactions`}
          checked={calendar.recordsInteractions}
          disabled={pending}
          onCheckedChange={(value) => actions.onRecordsInteractions(calendar, value)}
        />
      </div>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={`Actions for ${calendar.name}`}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{`Actions for ${calendar.name}`}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {allowed.pause && (
            <DropdownMenuItem onSelect={() => actions.onPause(calendar, true)}>
              <Pause />
              Pause sync
            </DropdownMenuItem>
          )}
          {allowed.resume && (
            <DropdownMenuItem onSelect={() => actions.onPause(calendar, false)}>
              <Play />
              Resume sync
            </DropdownMenuItem>
          )}
          {allowed.backfill && (
            <DropdownMenuItem onSelect={() => actions.onBackfill(calendar)}>
              <History />
              Backfill past meetings
            </DropdownMenuItem>
          )}
          {allowed.disconnect && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => actions.onDisconnect(calendar)}
              >
                <Unlink />
                Disconnect calendar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </ItemActions>
  );
}
