import { createContext, useContext, useEffect, useState } from "react";

import { CopyLink } from "../../context/links/copy-link";
import { TaskContext } from "../../context/references/task-context";
import { TaskComments } from "../comments/task-comments";
import { TaskForm } from "../editor/task-form";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { TaskDetail as TaskDetailView } from "@/components/tasks/detail/task-detail-view";
import type { ProjectDetail, Task } from "@/components/tasks/types";
import { workHref } from "@/lib/navigation/record-links";
import { useTaskUpdate } from "@/queries/tasks/mutations";

export const TaskInspectorActive = createContext(true);

export function TaskDetail({
  organizationId,
  detail,
  task,
  onClose,
  onSelectTask,
  onSubtask,
  visible,
  onDirtyChange,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task: Task;
  onClose: () => void;
  onSelectTask: (id: string) => void;
  onSubtask: () => void;
  visible: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const update = useTaskUpdate(organizationId, detail.project.entityId);
  const [editDirty, setEditDirty] = useState(false);
  const [commentDirty, setCommentDirty] = useState(false);
  const active = useContext(TaskInspectorActive);
  const dirty = active && (editDirty || commentDirty);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  return (
    <>
      <UnsavedChangesGuard
        dirty={dirty}
        description="Your task edits or comment haven’t been saved."
        name={`Task “${task.title}”`}
      />
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
            onDirtyChange={setEditDirty}
            onCancel={() => {
              setEditDirty(false);
              onDone();
            }}
            onSaved={() => {
              setEditDirty(false);
              onDone();
            }}
          />
        )}
      >
        <TaskContext
          visible={visible}
          organizationId={organizationId}
          taskEntityId={task.entityId}
        />
        <TaskComments
          visible={visible}
          organizationId={organizationId}
          projectEntityId={detail.project.entityId}
          taskEntityId={task.entityId}
          canComment={detail.level !== "view"}
          onDirtyChange={setCommentDirty}
        />
      </TaskDetailView>
    </>
  );
}
