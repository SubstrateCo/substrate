import { useRouter } from "@tanstack/react-router";

import { TaskForm as TaskFormView } from "@/components/tasks/editor/task-form-view";
import type { ProjectDetail, Task } from "@/components/tasks/types";
import { useTasksMutation } from "@/queries/tasks/mutations";

export function TaskForm({
  organizationId,
  detail,
  task,
  parentTaskEntityId,
  onSaved,
  onCancel,
  initialStatus,
  variant,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
  initialStatus?: Task["status"];
  variant?: "inline" | "dialog";
}) {
  const save = useTasksMutation(organizationId);
  const router = useRouter();
  return (
    <TaskFormView
      detail={detail}
      task={task}
      parentTaskEntityId={parentTaskEntityId}
      initialStatus={initialStatus}
      variant={variant}
      pending={save.isPending}
      error={save.error}
      onCancel={onCancel}
      onSubmit={(draft) => {
        const fields = { organizationId, projectEntityId: detail.project.entityId, ...draft };
        const destination = router.latestLocation.href;
        void save
          .mutateAsync(
            task
              ? { action: "updateTask", ...fields, taskEntityId: task.entityId }
              : { action: "createTask", ...fields, parentTaskEntityId },
          )
          .then(({ id }) => {
            if (router.latestLocation.href === destination) onSaved(id);
          })
          .catch(() => {});
      }}
    />
  );
}
