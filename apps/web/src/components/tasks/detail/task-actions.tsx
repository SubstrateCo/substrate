import { useNavigate } from "@tanstack/react-router";

import { useRef, useState } from "react";

import { TaskActionsMenu } from "./task-actions-menu";
import { TaskMoveDialog } from "./task-move-dialog";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import type { ProjectDetail, Task } from "@/components/tasks/types";
import { useTasksMutation } from "@/queries/tasks/mutations";

export function TaskActions({
  organizationId,
  detail,
  task,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task: Task;
}) {
  const [action, setAction] = useState<"move" | "delete" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const remove = useTasksMutation(organizationId);
  const navigate = useNavigate();
  const restoreFocus = () => trigger.current?.focus();
  return (
    <>
      <TaskActionsMenu
        triggerRef={trigger}
        onMove={() => setAction("move")}
        onDelete={() => {
          remove.reset();
          setAction("delete");
        }}
      />
      {action === "move" && (
        <TaskMoveDialog
          organizationId={organizationId}
          detail={detail}
          task={task}
          onClose={() => setAction(null)}
          onRestoreFocus={restoreFocus}
        />
      )}
      {action === "delete" && (
        <ConfirmDialog
          title={`Delete “${task.title}”?`}
          description="This task and all its subtasks will be removed, including access to their comments and attachments. This cannot be undone in the app."
          destructive
          confirmLabel="Delete task"
          pendingLabel="Deleting task…"
          pending={remove.isPending}
          error={remove.error}
          errorDescription="Couldn’t delete this task. Try again."
          onClose={() => setAction(null)}
          onRestoreFocus={restoreFocus}
          onConfirm={() => {
            void remove
              .mutateAsync({
                action: "deleteTask",
                organizationId,
                projectEntityId: detail.project.entityId,
                taskEntityId: task.entityId,
              })
              .then(() =>
                navigate({
                  to: "/tasks",
                  search: { workspaceId: organizationId, projectId: detail.project.entityId },
                }),
              )
              .catch(() => {});
          }}
        />
      )}
    </>
  );
}
