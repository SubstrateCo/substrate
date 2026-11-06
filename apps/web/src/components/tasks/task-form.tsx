import { TaskForm as TaskFormView } from "@/ui/tasks/task-form";
import type { ProjectDetail, Task } from "@/ui/tasks/types";
import { useTasksMutation } from "./use-tasks-mutation";

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
