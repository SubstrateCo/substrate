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
  readOnly = false,
}: {
  calendar: CalendarView;
  now: number;
  /** A change to this calendar is saving. */
  pending: boolean;
  actions?: CalendarRowActions;
  /** Detached calendars only show their history. */
  readOnly?: boolean;
}) {
  const id = useId();
  const allowed = calendarActions(calendar);
  const disconnected = calendar.syncStatus === "disconnected";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-56 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarColorDot color={calendar.color} />
          <p className="truncate text-sm font-medium" title={calendar.name}>
            {calendar.name}
          </p>
          {calendar.isPrimary && <Tag>Primary</Tag>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <CalendarStatusTag status={calendar.syncStatus} />
          <span
            title={calendar.lastSyncedAt ? formatFullTimestamp(calendar.lastSyncedAt) : undefined}
          >
            {lastSyncedLabel(calendar.lastSyncedAt, now)}
          </span>
        </div>
      </div>
      {!readOnly && actions && (
        <div className="flex shrink-0 items-center gap-3">
          {!disconnected && (
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-interactions`} className="text-xs text-muted-foreground">
                Create contacts and interactions
              </label>
              <Switch
                id={`${id}-interactions`}
                checked={calendar.recordsInteractions}
                disabled={pending}
                onCheckedChange={(value) => actions.onRecordsInteractions(calendar, value)}
              />
            </div>
          )}
          {allowed.reconnect && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => actions.onReconnect(calendar)}
            >
              <RotateCcw aria-hidden />
              Reconnect
            </Button>
          )}
          {!disconnected && (
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
          )}
        </div>
      )}
    </li>
  );
}
