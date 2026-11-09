import type { AgentRoutineView } from "@startup-os/contracts/agent-work";

import type { ReactNode } from "react";

import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

function schedule(routine: AgentRoutineView) {
  if (!routine.enabled) return "Paused";
  if (!routine.nextFireAt) return "Approved";
  const at = new Date(routine.nextFireAt).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `Next run ${at}`;
}

export function RoutineListView({
  routines,
  error,
  onRetry,
  editor,
  editingId,
  pending,
  onAdd,
  onEdit,
  onApprove,
  onDelete,
}: {
  routines: AgentRoutineView[];
  error: Error | null;
  onRetry: () => void;
  /** The open editor. "new" shows it above the list. */
  editor?: ReactNode;
  editingId?: string;
  pending: boolean;
  onAdd: () => void;
  onEdit: (routineId: string) => void;
  onApprove: (routine: AgentRoutineView) => void;
  onDelete: (routineId: string) => void;
}) {
  return (
    <section aria-label="Routines" className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Routines</h2>
        <Button type="button" size="xs" variant="outline" disabled={!!editingId} onClick={onAdd}>
          <Plus aria-hidden="true" />
          Add routine
        </Button>
      </div>
      {error && <ErrorState compact title="Couldn’t load routines" onRetry={onRetry} />}
      {editingId === "new" && editor}
      {!error && !routines.length && editingId !== "new" && (
        <p className="text-sm text-muted-foreground">
          Routines start background work on a schedule.
        </p>
      )}
      <ul className="grid gap-2">
        {routines.map((routine) =>
          editingId === routine.id ? (
            <li key={routine.id}>{editor}</li>
          ) : (
            <li key={routine.id} className="grid gap-1 rounded-xl border bg-card px-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{routine.name}</span>
                <code className="shrink-0 text-xs text-muted-foreground">
                  {routine.cron} · {routine.timezone}
                </code>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{routine.prompt}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {routine.approvedRevision !== routine.revision ? (
                  <>
                    <span className="font-medium text-warning">
                      Needs your approval · revision {routine.revision}
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      disabled={pending}
                      onClick={() => onApprove(routine)}
                    >
                      Approve
                    </Button>
                  </>
                ) : (
                  <span className="text-muted-foreground">{schedule(routine)}</span>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="ml-auto"
                  disabled={pending || !!editingId}
                  onClick={() => onEdit(routine.id)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => onDelete(routine.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
