import { CopyLink } from "../../context/links/copy-link";
import { TaskContext } from "../../context/references/task-context";
import { TaskComments } from "../comments/task-comments";
import { TaskForm } from "../editor/task-form";
import { TaskDetail as TaskDetailView } from "@/components/tasks/detail/task-detail-view";
import type { ProjectDetail, Task } from "@/components/tasks/types";
import { workHref } from "@/lib/navigation/record-links";
import { useTaskUpdate } from "@/queries/tasks/mutations";

export function TaskDetail({
  organizationId,
  detail,
  task,
  onClose,
  onSelectTask,
  onSubtask,
  visible,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task: Task;
  onClose: () => void;
  onSelectTask: (id: string) => void;
  onSubtask: () => void;
  visible: boolean;
}) {
  const update = useTaskUpdate(organizationId, detail.project.entityId);
  return (
    <TaskDetailView
      detail={detail}
      task={task}
      onClose={onClose}
      onSelectTask={onSelectTask}
      onSubtask={onSubtask}
      updateError={update.error}
      onUpdate={(patch) =>
        update.mutate({
          taskEntityId: task.entityId,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assigneeActorEntityId: task.assigneeActorEntityId,
          dueDate: task.dueDate,
          ...patch,
        })
      }
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
      <TaskContext visible={visible} organizationId={organizationId} taskEntityId={task.entityId} />
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
