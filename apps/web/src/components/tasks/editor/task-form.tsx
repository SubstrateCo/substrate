import { useRouter } from "@tanstack/react-router";

import type { ComponentProps } from "react";

import { changedTaskFields } from "./task-patch";
import { AttachFilesButton, AttachmentDraftList } from "@/components/attachments/attachment-picker";
import { FileDropZone } from "@/components/attachments/file-drop-zone";
import { TaskForm as TaskFormView } from "@/components/tasks/editor/task-form-view";
import type { Task } from "@/components/tasks/types";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useAttachmentUploads } from "@/queries/files/use-attachment-uploads";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { useLoadedProject } from "@/queries/tasks/use-project";

export function TaskForm({
  projectEntityId,
  task,
  parentTaskEntityId,
  onSaved,
  onCancel,
  initialStatus,
  renderCreate,
  onDirtyChange,
}: {
  projectEntityId: string;
  task?: Task;
  parentTaskEntityId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
  initialStatus?: Task["status"];
  renderCreate?: ComponentProps<typeof TaskFormView>["renderCreate"];
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const save = useTasksMutation(organizationId);
  const uploads = useAttachmentUploads();
  const router = useRouter();
  const detail = useLoadedProject(organizationId, projectEntityId).resource.data;
  // The project pane opens this form only once its project has loaded.
  if (!detail) return null;
  return (
    <TaskFormView
      detail={detail}
      task={task}
      parentTaskEntityId={parentTaskEntityId}
      initialStatus={initialStatus}
      renderCreate={renderCreate}
      onDirtyChange={onDirtyChange}
      pending={save.isPending}
      error={save.error}
      attachmentsReady={!uploads.items.length || uploads.ready}
      attachments={
        !task && (
          <FileDropZone
            label="New task attachments"
            disabled={save.isPending}
            onFiles={uploads.add}
          >
            <div className="grid gap-3 rounded-lg border border-dashed p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Drop files here · Up to 5 MiB each</p>
                <AttachFilesButton disabled={save.isPending} onFiles={uploads.add} />
              </div>
              <AttachmentDraftList uploads={uploads} disabled={save.isPending} />
            </div>
          </FileDropZone>
        )
      }
      onCancel={onCancel}
      onSubmit={(draft) => {
        const fields = { organizationId, projectEntityId, ...draft };
        const destination = router.latestLocation.href;
        const changes = task ? changedTaskFields(task, draft) : undefined;
        if (task && changes && !Object.keys(changes).length) {
          onSaved(task.entityId);
          return;
        }
        save.mutate(
          task
            ? {
                action: "updateTask",
                organizationId,
                projectEntityId,
                ...changes,
                taskEntityId: task.entityId,
              }
            : {
                action: "createTask",
                ...fields,
                parentTaskEntityId,
                attachmentFileIds: uploads.fileIds,
              },
          {
            // Opening the saved task would undo a move the person made while it saved.
            onSuccess: ({ id }) => {
              if (router.latestLocation.href === destination) onSaved(id);
            },
          },
        );
      }}
    />
  );
}
