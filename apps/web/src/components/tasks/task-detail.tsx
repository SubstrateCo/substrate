import { TaskDetail as TaskDetailView } from "@startup-os/ui/tasks/task-detail";
import type { ProjectDetail, Task } from "@startup-os/ui/tasks/types";
import { TaskComments } from "./task-comments";
import { TaskForm } from "./task-form";
import { TaskContext } from "../context/task-context";
import { CopyLink } from "../context/copy-link";
import { workHref } from "@/lib/context-links";

export function TaskDetail({
  organizationId,
  detail,
  task,
  onClose,
  onSubtask,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task: Task;
  onClose: () => void;
  onSubtask: () => void;
}) {
  return (
    <TaskDetailView
      detail={detail}
      task={task}
      onClose={onClose}
      onSubtask={onSubtask}
      renderEditor={(onDone) => (
        <TaskForm
          organizationId={organizationId}
          detail={detail}
          task={task}
          onCancel={onDone}
          onSaved={onDone}
        />
      )}
    >
      <CopyLink
        label="Copy task link"
        href={workHref(organizationId, detail.project.entityId, task.entityId)}
      />
      <TaskContext
        organizationId={organizationId}
        taskEntityId={task.entityId}
        projectEntityId={detail.project.entityId}
        projectName={detail.project.name}
      />
      <TaskComments
        organizationId={organizationId}
        projectEntityId={detail.project.entityId}
        taskEntityId={task.entityId}
        canComment={detail.level !== "view"}
      />
    </TaskDetailView>
  );
}
