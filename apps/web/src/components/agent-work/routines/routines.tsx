import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { useRef } from "react";

import type { RoutineDraft } from "./routine-draft";
import { RoutineEditor } from "./routine-editor";
import { RoutineListView } from "./routine-list-view";
import { describeSchedule } from "./schedule";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
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
 * saved; a routine the agent wrote or changed waits for the owner to approve it.
 */
export function Routines({ agentId, name }: { agentId: string; name: string }) {
  const { userId, organizationId } = useWorkspaceScope();
  const routines = useQuery(routinesOptions(userId, organizationId, agentId));
  const actions = useRoutineActions(userId, organizationId);
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
  return (
    <div ref={region} tabIndex={-1} className="outline-none">
      <RoutineListView
        name={name}
        routines={routines.data ?? []}
        loading={routines.isPending}
        error={routines.error}
        onRetry={() => void routines.refetch()}
        onAdd={() => editor.open("new")}
        onEdit={(routineId) => editor.open(routineId)}
        onDelete={(routine) => deletion.open(routine)}
        approvingId={actions.approve.isPending ? actions.approve.variables.routineId : undefined}
        onApprove={(routine) =>
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
          )
        }
      />
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
          description={`Its future runs stop (${describeSchedule(deleting.cron)}). Work it already did stays in ${name}’s activity and your conversations. You can’t undo this.`}
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
