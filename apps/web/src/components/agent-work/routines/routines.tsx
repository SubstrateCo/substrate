import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { useRef } from "react";

import type { RoutineDraft } from "./routine-draft";
import { RoutineEditor } from "./routine-editor";
import { RoutineListView } from "./routine-list-view";
import type { RoutineRowActions } from "./routine-row";
import { RoutineSummaryView } from "./routine-summary-view";
import { describeSchedule } from "./schedule";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useNow } from "@/hooks/use-now";
import { useRoutineActions } from "@/queries/agent-work/mutations";
import { routinesOptions } from "@/queries/agent-work/server";
import { toast } from "sonner";

const blank = (): RoutineDraft => ({
  name: "",
  prompt: "",
  cron: "0 9 * * 1-5",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  enabled: true,
});

const saveFailed = "We couldn’t save this routine. Try again.";

/**
 * An agent's routines, from the server on any owner device. The owner's saves are approved as
 * saved; a routine the agent wrote or changed waits for the owner to approve it. The summary is
 * the settings overview's short list; without `onShowAll` this is the full list.
 */
export function Routines({
  agentId,
  name,
  onShowAll,
}: {
  agentId: string;
  name: string;
  onShowAll?: () => void;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const routines = useQuery(routinesOptions(userId, organizationId, agentId));
  const actions = useRoutineActions(userId, organizationId);
  // The schedule switch keeps its own state, apart from the editor's save.
  const toggles = useRoutineActions(userId, organizationId);
  // The groups move between "Next 24 hours" and "Later" as time passes.
  const now = useNow(true, 60_000);
  // Focus falls back to the section when the launcher is gone, such as after a delete.
  const region = useRef<HTMLDivElement>(null);
  const editor = useStateDialog<string>(region);
  const deletion = useStateDialog<AgentRoutineView>(region);
  const editingId = editor.value;
  const deleting = deletion.value;
  const saveError = actions.create.error ?? actions.update.error;
  const editing = routines.data?.find((routine) => routine.id === editingId);
  const close = () => {
    editor.close();
    actions.create.reset();
    actions.update.reset();
  };
  const onSaved = (verb: string) => () => {
    toast.success(`Routine ${verb}.`);
    close();
  };
  const save = (draft: RoutineDraft) => {
    if (editing)
      actions.update.mutate(
        { routineId: editing.id, changes: draft },
        { onSuccess: onSaved("saved") },
      );
    else
      actions.create.mutate(
        { agentId, destination: null, ...draft },
        { onSuccess: onSaved("created") },
      );
  };
  const rowActions: RoutineRowActions = {
    onEdit: (routineId) => editor.open(routineId),
    onDelete: (routine) => deletion.open(routine),
    approvingId: actions.approve.isPending ? actions.approve.variables.routineId : undefined,
    onApprove: (routine) =>
      actions.approve.mutate(
        { routineId: routine.id, revision: routine.revision },
        {
          onSuccess: () => toast.success(`${routine.name} approved.`),
          onError: (error) =>
            toast.error(
              actionErrorMessage(
                error,
                "We couldn't approve this routine. It may have changed; check it and try again.",
              ),
            ),
        },
      ),
    togglingId: toggles.update.isPending ? toggles.update.variables.routineId : undefined,
    onEnabledChange: (routine, enabled) =>
      toggles.update.mutate(
        { routineId: routine.id, changes: { enabled } },
        {
          onSuccess: () => toast.success(`${routine.name} ${enabled ? "turned on" : "paused"}.`),
          onError: (error) =>
            toast.error(actionErrorMessage(error, "We couldn’t change this routine. Try again.")),
        },
      ),
  };
  const list = {
    name,
    routines: routines.data ?? [],
    now,
    loading: routines.isPending,
    error: routines.error,
    onRetry: () => void routines.refetch(),
    onAdd: () => editor.open("new"),
    ...rowActions,
  };
  return (
    <div ref={region} tabIndex={-1} className="outline-none">
      {onShowAll ? (
        <RoutineSummaryView {...list} onShowAll={onShowAll} />
      ) : (
        <RoutineListView {...list} />
      )}
      {editingId && (
        <RoutineEditor
          key={editingId}
          agentName={name}
          editing={editing?.name}
          initial={
            editing
              ? {
                  name: editing.name,
                  prompt: editing.prompt,
                  cron: editing.cron,
                  timezone: editing.timezone,
                  enabled: editing.enabled,
                }
              : blank()
          }
          pending={actions.create.isPending || actions.update.isPending}
          error={saveError && actionErrorMessage(saveError, saveFailed)}
          onSave={save}
          onCancel={close}
          onRestoreFocus={editor.restoreFocus}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description={`Its future runs stop (${describeSchedule(deleting.cron)}). Work it already did stays in ${name}’s work and your conversations. You can’t undo this.`}
          confirmLabel="Delete routine"
          destructive
          pending={actions.remove.isPending}
          error={actions.remove.error}
          errorDescription="We couldn’t delete this routine. Try again."
          onConfirm={() =>
            actions.remove.mutate(deleting.id, {
              onSuccess: () => {
                toast.success(`${deleting.name} deleted.`);
                deletion.close();
              },
            })
          }
          onClose={() => {
            deletion.close();
            actions.remove.reset();
          }}
          onRestoreFocus={deletion.restoreFocus}
        />
      )}
    </div>
  );
}
