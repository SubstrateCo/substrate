import { createRoutineInput, updateRoutineInput } from "@startup-os/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { RoutineEditor, type RoutineDraft } from "./routine-editor";
import { RoutineListView } from "./routine-list-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
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

/** An agent's routines on its home desktop. Each revision runs only after the owner approves it. */
export function Routines({
  userId,
  organizationId,
  agentId,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
}) {
  const routines = useQuery(routinesOptions(userId, organizationId, agentId));
  const actions = useRoutineActions(userId, organizationId);
  const [editingId, setEditingId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const editing = routines.data?.find((routine) => routine.id === editingId);
  const close = () => {
    setEditingId(undefined);
    setError(null);
  };
  const save = (draft: RoutineDraft) => {
    const onError = (failure: Error) =>
      setError(actionErrorMessage(failure, "We couldn’t save this routine."));
    if (editing) {
      const input = updateRoutineInput.safeParse({ routineId: editing.id, changes: draft });
      if (!input.success) return setError(input.error.issues[0]?.message ?? "Check the routine.");
      actions.update.mutate(input.data, { onSuccess: close, onError });
    } else {
      const input = createRoutineInput.safeParse({ agentId, destination: null, ...draft });
      if (!input.success) return setError(input.error.issues[0]?.message ?? "Check the routine.");
      actions.create.mutate(input.data, { onSuccess: close, onError });
    }
  };
  const fail = (fallback: string) => (failure: Error) =>
    toast.error(actionErrorMessage(failure, fallback));
  return (
    <RoutineListView
      routines={routines.data ?? []}
      error={routines.error}
      onRetry={() => void routines.refetch()}
      editingId={editingId}
      pending={actions.approve.isPending || actions.remove.isPending}
      editor={
        editingId && (
          <RoutineEditor
            key={editingId}
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
        )
      }
      onAdd={() => setEditingId("new")}
      onEdit={setEditingId}
      onApprove={(routine) =>
        actions.approve.mutate(
          { routineId: routine.id, revision: routine.revision },
          { onError: fail("We couldn’t approve this routine.") },
        )
      }
      onDelete={(routineId) =>
        actions.remove.mutate(routineId, { onError: fail("We couldn’t delete this routine.") })
      }
    />
  );
}
