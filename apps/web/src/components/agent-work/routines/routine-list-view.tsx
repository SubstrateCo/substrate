import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import type { ReactNode } from "react";

import { describeSchedule } from "./schedule";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { SettingsList, SettingsSection } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { formatDateTime, formatTimeZone, formatZonedDateTime } from "@/lib/format/date";
import { CalendarClock, Hand, Pencil, Plus, Trash2 } from "lucide-react";

function RoutineRow({ children }: { children: ReactNode }) {
  return (
    <Item asChild size="xs" className="group/row">
      <li>{children}</li>
    </Item>
  );
}

function RoutineRowsLoading() {
  return (
    <div role="status" aria-label="Loading routines">
      <SettingsList hidden>
        {[0, 1].map((i) => (
          <RoutineRow key={i}>
            <ItemContent className="min-w-0">
              <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <SkeletonText width="12rem" />
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <SkeletonText width="16rem" />
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                <SkeletonText width="20rem" />
              </p>
            </ItemContent>
          </RoutineRow>
        ))}
      </SettingsList>
    </div>
  );
}

/** Next run in the viewer's zone, with the schedule's own clock in the tooltip. */
function nextRun(routine: AgentRoutineView) {
  if (routine.approvedRevision !== routine.revision || !routine.enabled || !routine.nextFireAt)
    return undefined;
  return {
    text: `Next run ${formatDateTime(routine.nextFireAt)} in your time zone`,
    title: `${formatZonedDateTime(routine.nextFireAt, routine.timezone)} in the schedule’s time zone`,
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
        <SettingsList label="Routines">
          {routines.map((routine) => {
            const needsApproval = routine.approvedRevision !== routine.revision;
            const next = nextRun(routine);
            return (
              <RoutineRow key={routine.id}>
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full">
                    <span className="truncate">{routine.name}</span>
                    {!needsApproval && !routine.enabled && <Tag>Paused</Tag>}
                  </ItemTitle>
                  <ItemDescription>
                    {describeSchedule(routine.cron)} ·{" "}
                    {formatTimeZone(routine.timezone, routine.nextFireAt ?? undefined)}
                  </ItemDescription>
                  {next && <ItemDescription title={next.title}>{next.text}</ItemDescription>}
                  <ItemDescription>{routine.prompt}</ItemDescription>
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
                        onClick={() => onApprove(routine)}
                      >
                        Approve
                      </PendingButton>
                    </div>
                  )}
                </ItemContent>
                <ItemActions>
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
              </RoutineRow>
            );
          })}
        </SettingsList>
      )}
      {error && routines.length > 0 && (
        <ErrorState compact title="Couldn’t refresh routines" onRetry={onRetry} />
      )}
    </SettingsSection>
  );
}
