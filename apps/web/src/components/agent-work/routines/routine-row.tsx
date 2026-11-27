import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import { describeSchedule } from "./schedule";
import { PendingButton } from "@/components/feedback/pending-button";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { needsApproval } from "@/lib/agent-work/routine-groups";
import { formatDateTime, formatTimeZone, formatZonedDateTime } from "@/lib/format/date";
import { CalendarClock, Hand, Pencil, Trash2 } from "lucide-react";

/** Next run in the viewer's zone, with the schedule's own clock in the tooltip. */
function nextRun(routine: AgentRoutineView) {
  if (!routine.enabled || !routine.nextFireAt) return undefined;
  return {
    text: `Next run ${formatDateTime(routine.nextFireAt)}`,
    title: `${formatZonedDateTime(routine.nextFireAt, routine.timezone)} in the schedule’s time zone`,
  };
}

export type RoutineRowActions = {
  onEdit: (routineId: string) => void;
  onDelete: (routine: AgentRoutineView) => void;
  /** Approves the routine's current revision, for routines the agent wrote or changed. */
  onApprove: (routine: AgentRoutineView) => void;
  /** Turns an approved routine's schedule on or off. */
  onEnabledChange: (routine: AgentRoutineView, enabled: boolean) => void;
  /** The routine whose approval is being sent. */
  approvingId?: string;
  /** The routine whose schedule is being turned on or off. */
  togglingId?: string;
};

/**
 * One routine. A routine waiting for approval shows only Approve: turning it on would approve it
 * without a look at what the agent wrote.
 */
export function RoutineRow({
  routine,
  showPrompt = false,
  onEdit,
  onDelete,
  onApprove,
  onEnabledChange,
  approvingId,
  togglingId,
}: { routine: AgentRoutineView; showPrompt?: boolean } & RoutineRowActions) {
  const unapproved = needsApproval(routine);
  const next = unapproved ? undefined : nextRun(routine);
  return (
    <Item asChild size="xs" className="group/row">
      <li>
        <ItemMedia variant="icon">
          {unapproved ? (
            <Hand aria-hidden="true" className="text-warning" />
          ) : (
            <CalendarClock aria-hidden="true" className="text-muted-foreground" />
          )}
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full">
            <span className="truncate">{routine.name}</span>
            {unapproved && <Tag tone="warning">Needs your approval</Tag>}
            {!unapproved && !routine.enabled && <Tag>Paused</Tag>}
          </ItemTitle>
          <ItemDescription>
            {describeSchedule(routine.cron)} ·{" "}
            {formatTimeZone(routine.timezone, routine.nextFireAt ?? undefined)}
          </ItemDescription>
          {next && <ItemDescription title={next.title}>{next.text}</ItemDescription>}
          {/*
            Future: the last run's result, once the server reports it with each routine.
            {routine.lastRun?.status === "failed" && (
              <ItemDescription className="text-destructive">
                Last run failed <Timestamp value={routine.lastRun.finishedAt} />
              </ItemDescription>
            )}
          */}
          {showPrompt && <ItemDescription>{routine.prompt}</ItemDescription>}
        </ItemContent>
        <ItemActions>
          {unapproved ? (
            <PendingButton
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Approve ${routine.name}`}
              disabled={!!approvingId}
              pending={approvingId === routine.id}
              onClick={() => onApprove(routine)}
            >
              Approve
            </PendingButton>
          ) : (
            <Switch
              aria-label={`Run ${routine.name} on schedule`}
              checked={routine.enabled}
              disabled={togglingId === routine.id}
              onCheckedChange={(enabled) => onEnabledChange(routine, enabled)}
            />
          )}
          <RowActions label={`Actions for ${routine.name}`}>
            <RowAction label={`Edit ${routine.name}`} onClick={() => onEdit(routine.id)}>
              <Pencil />
            </RowAction>
            <RowAction
              label={`Delete ${routine.name}`}
              destructive
              onClick={() => onDelete(routine)}
            >
              <Trash2 />
            </RowAction>
          </RowActions>
        </ItemActions>
      </li>
    </Item>
  );
}

export function RoutineRowLoading() {
  return (
    <Item asChild size="xs">
      <li>
        <ItemContent className="min-w-0">
          <p className="text-sm font-medium">
            <SkeletonText width="12rem" />
          </p>
          <p className="text-xs text-muted-foreground">
            <SkeletonText width="16rem" />
          </p>
        </ItemContent>
      </li>
    </Item>
  );
}
