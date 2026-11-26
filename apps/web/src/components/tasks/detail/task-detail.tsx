import { useContext, useState } from "react";

import { CopyLink } from "../../context/links/copy-link";
import { TaskContext } from "../../context/references/task-context";
import { TaskForm } from "../editor/task-form";
import { TaskLinks } from "../links/task-links";
import { TaskActions } from "./task-actions";
import { TaskDiscussion } from "./task-discussion";
import { TaskInspectorActive } from "./task-inspector-context";
import { TaskAttachments } from "@/components/attachments/task-attachments";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { useRegisterDraft } from "@/components/feedback/unsaved-drafts-context";
import { TaskDetail as TaskDetailView } from "@/components/tasks/detail/task-detail-view";
import type { ProjectDetail, Task } from "@/components/tasks/types";
import { workLink } from "@/lib/navigation/record-links";
import type { ProjectCapabilities } from "@/lib/tasks/project-capabilities";
import { useTaskUpdate } from "@/queries/tasks/mutations";
import { toast } from "sonner";

export function TaskDetail({
  organizationId,
  detail,
  capabilities,
  task,
  onSelectTask,
  onSubtask,
  visible,
}: {
  organizationId: string;
  detail: ProjectDetail;
  capabilities: ProjectCapabilities;
  task: Task;
  onSelectTask: (id: string) => void;
  onSubtask: () => void;
  visible: boolean;
}) {
  const update = useTaskUpdate(organizationId, detail.project.entityId);
  const [editDirty, setEditDirty] = useState(false);
  const active = useContext(TaskInspectorActive);
  const dirty = active && editDirty;
  useRegisterDraft(task.entityId, dirty);
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
            {capabilities.canEdit && (
              <TaskActions organizationId={organizationId} detail={detail} task={task} />
            )}
          </>
        }
        links={
          <TaskLinks
            organizationId={organizationId}
            detail={detail}
            canEdit={capabilities.canEdit}
            task={task}
            onSelectTask={onSelectTask}
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
        <TaskDiscussion
          conversationId={task.discussionConversationId ?? null}
          visible={visible}
          organizationId={organizationId}
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
        <TaskContext
          visible={visible}
          organizationId={organizationId}
          taskEntityId={task.entityId}
        />
      </TaskDetailView>
    </>
  );
}
