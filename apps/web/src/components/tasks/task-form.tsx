import { useTasksMutation } from "./use-tasks-mutation";
import { TaskForm as TaskFormView } from "@/components/tasks/task-form-view";
import type { ProjectDetail, Task } from "@/components/tasks/types";

export function TaskForm({
  organizationId,
  detail,
  task,
  parentTaskEntityId,
  onSaved,
  onCancel,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const save = useTasksMutation(organizationId);
  return (
    <TaskFormView
      detail={detail}
      task={task}
      parentTaskEntityId={parentTaskEntityId}
      pending={save.isPending}
      error={save.error}
      onCancel={onCancel}
      onSubmit={(draft) => {
        const fields = { organizationId, projectEntityId: detail.project.entityId, ...draft };
        save.mutate(
          task
            ? { action: "updateTask", ...fields, taskEntityId: task.entityId }
            : { action: "createTask", ...fields, parentTaskEntityId },
          { onSuccess: ({ id }) => onSaved(id) },
        );
      }}
    />
  );
}
