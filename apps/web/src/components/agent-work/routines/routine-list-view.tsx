import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import type { ReactNode } from "react";

import { describeSchedule } from "./schedule";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { actionRow, RowAction, RowActions } from "@/components/layout/row-actions";
import { SettingsSection } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import {
  formatDateTime,
  formatDateTimeInZone,
  formatFullTimestamp,
  formatTimeZone,
  formatZonedDateTime,
} from "@/lib/format/date";
import { cn } from "cn";
import { CalendarClock, Hand, Pencil, Plus, Trash2 } from "lucide-react";

function RoutineRow({ children }: { children: ReactNode }) {
  return <li className={cn(actionRow, "flex min-w-0 items-start gap-3 px-4 py-3")}>{children}</li>;
}

function RoutineContent({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 flex-1 gap-0.5">{children}</div>;
}

export function RoutineRowsLoading() {
  return (
    <div role="status" aria-label="Loading routines">
      <ul aria-hidden="true" className="divide-y overflow-hidden rounded-xl border bg-card">
        {[0, 1].map((i) => (
          <RoutineRow key={i}>
            <RoutineContent>
              <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <SkeletonText width="12rem" />
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <SkeletonText width="16rem" />
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                <SkeletonText width="20rem" />
              </p>
            </RoutineContent>
          </RoutineRow>
        ))}
      </ul>
    </div>
  );
}

/** "Next run Wed, Nov 11, 9:00 AM EST": in the routine's own zone, so it matches its schedule. */
function nextRun(routine: AgentRoutineView) {
  if (routine.approvedRevision !== routine.revision || !routine.enabled || !routine.nextFireAt)
    return undefined;
  const own = formatDateTimeInZone(routine.nextFireAt, routine.timezone);
  // The viewer's own clock, only for a person in another zone than the schedule.
  const local = formatDateTime(routine.nextFireAt);
  return {
    text: `Next run ${formatZonedDateTime(routine.nextFireAt, routine.timezone)}`,
    title:
      own === local ? undefined : `${formatFullTimestamp(routine.nextFireAt)} in your time zone`,
  };
}

export function RoutineListView({
  name,
  routines,
  loading,
  error,
  onRetry,
  approvingId,
  onAdd,
  onEdit,
  onApprove,
  onDelete,
}: {
  name: string;
  routines: AgentRoutineView[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** The routine whose approval is being sent. */
  approvingId?: string;
  onAdd: () => void;
  onEdit: (routineId: string) => void;
  onApprove: (routine: AgentRoutineView) => void;
  onDelete: (routine: AgentRoutineView) => void;
}) {
  const add = (
    <Button type="button" onClick={onAdd}>
      <Plus aria-hidden="true" />
      New routine
    </Button>
  );
  return (
    <SettingsSection
      title="Routines"
      description={`Work ${name} starts on a schedule. Each new or changed routine waits for your approval.`}
      actions={routines.length > 0 && add}
    >
      {error && !routines.length && (
        <ErrorState compact title="Couldn’t load routines" onRetry={onRetry} />
      )}
      {loading && !routines.length && <RoutineRowsLoading />}
      {!loading && !error && !routines.length && (
        <ContentNotice
          icon={CalendarClock}
          title="No routines yet"
          description={`A routine asks ${name} to do something on a schedule, like a summary every weekday at 9:00 AM.`}
          action={add}
        />
      )}
      {routines.length > 0 && (
        <ul aria-label="Routines" className="divide-y overflow-hidden rounded-xl border bg-card">
          {routines.map((routine) => {
            const needsApproval = routine.approvedRevision !== routine.revision;
            const next = nextRun(routine);
            return (
              <RoutineRow key={routine.id}>
                <RoutineContent>
                  <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <span className="truncate">{routine.name}</span>
                    {!needsApproval && !routine.enabled && <Tag>Paused</Tag>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {describeSchedule(routine.cron)} ·{" "}
                    {formatTimeZone(routine.timezone, routine.nextFireAt ?? undefined)}
                  </p>
                  {next && (
                    <p className="truncate text-xs text-muted-foreground" title={next.title}>
                      {next.text}
                    </p>
                  )}
                  <p className="line-clamp-2 text-xs text-muted-foreground">{routine.prompt}</p>
                  {needsApproval && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-warning-text">
                        <Hand aria-hidden="true" className="size-3.5" />
                        {routine.approvedRevision === null
                          ? "Waiting for your approval to run"
                          : "Changed — waiting for your approval"}
                      </span>
                      <PendingButton
                        type="button"
                        size="xs"
                        disabled={!!approvingId}
                        pending={approvingId === routine.id}
                        pendingLabel="Approving…"
                        onClick={() => onApprove(routine)}
                      >
                        Approve
                      </PendingButton>
                    </div>
                  )}
                </RoutineContent>
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
              </RoutineRow>
            );
          })}
        </ul>
      )}
      {error && routines.length > 0 && (
        <ErrorState compact title="Couldn’t refresh routines" onRetry={onRetry} />
      )}
    </SettingsSection>
  );
}
