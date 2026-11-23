import { useNavigate } from "@tanstack/react-router";

import { useRef } from "react";

import { TaskActionsMenu } from "./task-actions-menu";
import { TaskMoveDialog } from "./task-move-dialog";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
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
  const trigger = useRef<HTMLButtonElement>(null);
  const { value: action, open, close, restoreFocus } = useStateDialog<"move" | "delete">(trigger);
  const remove = useTasksMutation(organizationId);
  const navigate = useNavigate();
  return (
    <>
      <TaskActionsMenu
        triggerRef={trigger}
        onMove={() => open("move")}
        onDelete={() => {
          remove.reset();
          open("delete");
        }}
      />
      {action === "move" && (
        <TaskMoveDialog
          organizationId={organizationId}
          detail={detail}
          task={task}
          onClose={close}
          onRestoreFocus={restoreFocus}
        />
      )}
      {action === "delete" && (
        <ConfirmDialog
          title={`Delete “${task.title}”?`}
          description="This task and all its subtasks will be removed, including access to their comments and attachments. This cannot be undone in the app."
          destructive
          confirmLabel="Delete task"
          pending={remove.isPending}
          error={remove.error}
          errorDescription="Couldn’t delete this task. Try again."
          onClose={close}
          onRestoreFocus={restoreFocus}
          onConfirm={() =>
            remove.mutate(
              {
                action: "deleteTask",
                organizationId,
                projectEntityId: detail.project.entityId,
                taskEntityId: task.entityId,
              },
              {
                onSuccess: () =>
                  void navigate({
                    to: "/tasks",
                    search: { workspaceId: organizationId, projectId: detail.project.entityId },
                  }),
              },
            )
          }
        />
      )}
    </>
  );
}
