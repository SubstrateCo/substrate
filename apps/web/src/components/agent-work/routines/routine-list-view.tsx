import type { AgentRoutineView } from "@startup-os/contracts/agent-work";

import type { ReactNode } from "react";

import { describeSchedule } from "./schedule";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SettingsSection } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format/date";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";

function state(routine: AgentRoutineView) {
  if (routine.approvedRevision !== routine.revision) return undefined;
  if (!routine.enabled) return "Paused";
  if (!routine.nextFireAt) return "Approved";
  return `Next run ${formatDateTime(routine.nextFireAt)}`;
}

function RowAction({
  label,
  destructive = false,
  onClick,
  children,
}: {
  label: string;
  destructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant={destructive ? "destructive-ghost" : "ghost"}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
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
      Add routine
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
      {loading && <LoadingState label="Loading routines" variant="compact" rows={2} />}
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
            return (
              <li key={routine.id} className="group flex min-w-0 items-start gap-3 px-4 py-3">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="truncate text-sm font-medium">{routine.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {describeSchedule(routine.cron)} · {routine.timezone.replaceAll("_", " ")}
                    {state(routine) && ` · ${state(routine)}`}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{routine.prompt}</p>
                  {needsApproval && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-warning">
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
                </div>
                <div
                  role="group"
                  aria-label={`Actions for ${routine.name}`}
                  className="flex shrink-0 gap-0.5"
                >
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
                </div>
              </li>
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
