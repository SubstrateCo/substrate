import { CopyLink } from "../../context/links/copy-link";
import { TaskContext } from "../../context/references/task-context";
import { TaskComments } from "../comments/task-comments";
import { TaskForm } from "../editor/task-form";
import { TaskDetail as TaskDetailView } from "@/components/tasks/detail/task-detail-view";
import type { ProjectDetail, Task } from "@/components/tasks/types";
import { workHref } from "@/lib/navigation/record-links";

export function TaskDetail({
  organizationId,
  detail,
  task,
  onClose,
  onSubtask,
  visible,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task: Task;
  onClose: () => void;
  onSubtask: () => void;
  visible: boolean;
}) {
  return (
    <TaskDetailView
      detail={detail}
      task={task}
      onClose={onClose}
      onSubtask={onSubtask}
      actions={
        <CopyLink
          grouped
          label="Copy task link"
          href={workHref(organizationId, detail.project.entityId, task.entityId)}
        />
      }
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
      <TaskContext
        visible={visible}
        organizationId={organizationId}
        taskEntityId={task.entityId}
        projectEntityId={detail.project.entityId}
        projectName={detail.project.name}
      />
      <TaskComments
        visible={visible}
        organizationId={organizationId}
        projectEntityId={detail.project.entityId}
        taskEntityId={task.entityId}
        canComment={detail.level !== "view"}
      />
    </TaskDetailView>
  );
}
