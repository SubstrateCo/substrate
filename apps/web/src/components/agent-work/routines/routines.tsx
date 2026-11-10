import type { AgentRoutineView } from "@startup-os/contracts/agent-work";
import { createRoutineInput, updateRoutineInput } from "@startup-os/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import type { RoutineDraft } from "./routine-draft";
import { RoutineEditor } from "./routine-editor";
import { RoutineListView } from "./routine-list-view";
import { describeSchedule } from "./schedule";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { routinesOptions } from "@/queries/agent-work/local";
import { useRoutineActions } from "@/queries/agent-work/mutations";
import { toast } from "sonner";

const blank = (): RoutineDraft => ({
  name: "",
  prompt: "",
  cron: "0 9 * * 1-5",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  enabled: true,
});

const saveFailed = "We couldn’t save this routine. Try again.";

/** An agent's routines on its home desktop. Each revision runs only after the owner approves it. */
export function Routines({
  userId,
  organizationId,
  agentId,
  name,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
  name: string;
}) {
  const routines = useQuery(routinesOptions(userId, organizationId, agentId));
  const actions = useRoutineActions(userId, organizationId);
  const [editingId, setEditingId] = useState<string>();
  const [deleting, setDeleting] = useState<AgentRoutineView>();
  const [error, setError] = useState<string | null>(null);
  const editing = routines.data?.find((routine) => routine.id === editingId);
  const close = () => {
    setEditingId(undefined);
    setError(null);
  };
  const onSaved = (verb: string) => () => {
    toast.success(`Routine ${verb}. Approve it to start running it.`);
    close();
  };
  const onError = (failure: Error) => setError(actionErrorMessage(failure, saveFailed));
  // The editor checks each field first; this only guards the contract.
  const save = (draft: RoutineDraft) => {
    setError(null);
    if (editing) {
      const input = updateRoutineInput.safeParse({ routineId: editing.id, changes: draft });
      if (!input.success) return setError(saveFailed);
      actions.update.mutate(input.data, { onSuccess: onSaved("saved"), onError });
    } else {
      const input = createRoutineInput.safeParse({ agentId, destination: null, ...draft });
      if (!input.success) return setError(saveFailed);
      actions.create.mutate(input.data, { onSuccess: onSaved("created"), onError });
    }
  };
  return (
    <>
      <RoutineListView
        name={name}
        routines={routines.data ?? []}
        loading={routines.isPending}
        error={routines.error}
        onRetry={() => void routines.refetch()}
        approvingId={actions.approve.isPending ? actions.approve.variables.routineId : undefined}
        onAdd={() => setEditingId("new")}
        onEdit={setEditingId}
        onApprove={(routine) =>
          actions.approve.mutate(
            { routineId: routine.id, revision: routine.revision },
            {
              onSuccess: () => toast.success(`${routine.name} approved.`),
              onError: (failure) =>
                toast.error(actionErrorMessage(failure, "We couldn’t approve this routine.")),
            },
          )
        }
        onDelete={setDeleting}
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
          error={error}
          onSave={save}
          onCancel={close}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description={`Its future runs stop (${describeSchedule(deleting.cron)}). Work it already did stays in ${name}’s activity and your conversations. You can’t undo this.`}
          confirmLabel="Delete routine"
          pendingLabel="Deleting…"
          destructive
          pending={actions.remove.isPending}
          error={actions.remove.error}
          errorDescription="We couldn’t delete this routine. Try again."
          onConfirm={() =>
            actions.remove.mutate(deleting.id, {
              onSuccess: () => {
                toast.success(`${deleting.name} deleted.`);
                setDeleting(undefined);
              },
            })
          }
          onClose={() => {
            setDeleting(undefined);
            actions.remove.reset();
          }}
        />
      )}
    </>
  );
}
