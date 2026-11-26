import { useContext, useState } from "react";

import { CopyLink } from "../../context/links/copy-link";
import { TaskContext } from "../../context/references/task-context";
import { TaskForm } from "../editor/task-form";
import { TaskLinks } from "../links/task-links";
import { TaskActions } from "./task-actions";
import { TaskDiscussion } from "./task-discussion";
import { TaskInspectorActive } from "./task-inspector-context";
import { TaskAttachments } from "@/components/attachments/task-attachments";
import { TaskSourceAttachments } from "@/components/attachments/task-source-attachments";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { useRegisterDraft } from "@/components/feedback/unsaved-drafts-context";
import { TaskDetail as TaskDetailView } from "@/components/tasks/detail/task-detail-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { workLink } from "@/lib/navigation/record-links";
import { useTaskUpdate } from "@/queries/tasks/mutations";
import { useLoadedProject } from "@/queries/tasks/use-project";
import { toast } from "sonner";

export function TaskDetail({
  projectEntityId,
  taskId,
  onSelectTask,
  onSubtask,
  visible,
}: {
  projectEntityId: string;
  taskId: string;
  onSelectTask: (id: string) => void;
  onSubtask: () => void;
  visible: boolean;
}) {
  const { organizationId } = useWorkspaceScope();
  const { resource, capabilities } = useLoadedProject(organizationId, projectEntityId);
  const update = useTaskUpdate(organizationId, projectEntityId);
  const [editDirty, setEditDirty] = useState(false);
  const active = useContext(TaskInspectorActive);
  const dirty = active && editDirty;
  useRegisterDraft(taskId, dirty);
  const detail = resource.data;
  const task = detail?.tasks.find((candidate) => candidate.entityId === taskId);
  // The project pane renders this only for a task in its loaded project.
  if (!detail || !task) return null;
  return (
    <>
      <UnsavedChangesGuard
        dirty={dirty}
        description="Your task edits haven’t been saved."
        name={`Task “${task.title}”`}
      />
      <TaskDetailView
        capabilities={capabilities}
        detail={detail}
        task={task}
        onSelectTask={onSelectTask}
        onSubtask={onSubtask}
        onUpdate={(patch) =>
          update.mutate(
            {
              taskEntityId: task.entityId,
              ...patch,
            },
            {
              onError: (error) =>
                toast.error(
                  actionErrorMessage(error, "Couldn’t update this task. Your change was undone."),
                ),
            },
          )
        }
        actions={
          <>
            <CopyLink
              grouped
              label="Copy task link"
              link={workLink(organizationId, detail.project.entityId, task.entityId)}
            />
            {capabilities.canEdit && <TaskActions task={task} />}
          </>
        }
        links={<TaskLinks task={task} onSelectTask={onSelectTask} />}
        renderEditor={(onDone) => (
          <TaskForm
            projectEntityId={projectEntityId}
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
        <TaskDiscussion
          conversationId={task.discussionConversationId ?? null}
          visible={visible}
          projectEntityId={detail.project.entityId}
          taskEntityId={task.entityId}
          archived={!!detail.project.archivedAt}
        />
        <TaskAttachments
          key={`${organizationId}:${task.entityId}`}
          target={{
            organizationId,
            projectEntityId: detail.project.entityId,
            taskEntityId: task.entityId,
          }}
          canEdit={capabilities.canEdit}
          visible={visible}
        />
        <TaskSourceAttachments
          key={`${organizationId}:${task.entityId}:source`}
          target={{
            organizationId,
            projectEntityId: detail.project.entityId,
            taskEntityId: task.entityId,
          }}
          visible={visible}
        />
        <TaskContext visible={visible} taskEntityId={task.entityId} />
      </TaskDetailView>
    </>
  );
}
