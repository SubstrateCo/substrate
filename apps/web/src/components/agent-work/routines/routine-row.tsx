import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import type { ReactNode } from "react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { needsApproval } from "@/lib/agent-work/routine-groups";
import { formatDateTime, formatTimeZone, formatZonedDateTime } from "@/lib/format/date";
import { CalendarClock, Hand, Pencil, Trash2 } from "lucide-react";

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
  onApprove: (routine: AgentRoutineView) => void;
  onEnabledChange: (routine: AgentRoutineView, enabled: boolean) => void;
  approvingId?: string;
  togglingId?: string;
};

export function RoutineRow({
  routine,
  detail,
  onApprove,
  onEnabledChange,
  approvingId,
  togglingId,
  ...actions
}: { routine: AgentRoutineView; detail?: ReactNode } & RoutineRowActions) {
  if (needsApproval(routine))
    return (
      <RoutineRowLayout
        routine={routine}
        icon={<Hand aria-hidden="true" className="text-warning" />}
        tag={<Tag tone="warning">Needs your approval</Tag>}
        detail={detail}
        control={
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
        }
        {...actions}
      />
    );
  const next = nextRun(routine);
  return (
    <RoutineRowLayout
      routine={routine}
      icon={<CalendarClock aria-hidden="true" className="text-muted-foreground" />}
      next={next && <ItemDescription title={next.title}>{next.text}</ItemDescription>}
      detail={detail}
      control={
        <Switch
          aria-label={`Run ${routine.name} on schedule`}
          checked={routine.enabled}
          disabled={togglingId === routine.id}
          onCheckedChange={(enabled) => onEnabledChange(routine, enabled)}
        />
      }
      {...actions}
    />
  );
}

function RoutineRowLayout({
  routine,
  icon,
  tag,
  next,
  detail,
  control,
  onEdit,
  onDelete,
}: {
  routine: AgentRoutineView;
  icon: ReactNode;
  tag?: ReactNode;
  next?: ReactNode;
  detail?: ReactNode;
  control: ReactNode;
} & Pick<RoutineRowActions, "onEdit" | "onDelete">) {
  return (
    <Item asChild size="xs" className="group/row">
      <li>
        <ItemMedia variant="icon">{icon}</ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full">
            <span className="truncate">{routine.name}</span>
            {tag}
          </ItemTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <ItemDescription tabIndex={0}>{describeSchedule(routine.cron)}</ItemDescription>
              </TooltipTrigger>
              <TooltipContent>
                {formatTimeZone(routine.timezone, routine.nextFireAt ?? undefined)}
              </TooltipContent>
            </Tooltip>
            {next}
          </div>
          {detail}
        </ItemContent>
        <ItemActions className="self-start">
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
          {control}
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
