import { useRouter } from "@tanstack/react-router";

import type { ComponentProps } from "react";

import { changedTaskFields } from "./task-patch";
import { AttachFilesButton, AttachmentDraftList } from "@/components/attachments/attachment-picker";
import { FileDropZone } from "@/components/attachments/file-drop-zone";
import { TaskForm as TaskFormView } from "@/components/tasks/editor/task-form-view";
import type { ProjectDetail, Task } from "@/components/tasks/types";
import { useAttachmentUploads } from "@/queries/files/use-attachment-uploads";
import { useTasksMutation } from "@/queries/tasks/mutations";

export function TaskForm({
  organizationId,
  detail,
  task,
  parentTaskEntityId,
  onSaved,
  onCancel,
  initialStatus,
  renderCreate,
  onDirtyChange,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
  initialStatus?: Task["status"];
  renderCreate?: ComponentProps<typeof TaskFormView>["renderCreate"];
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const save = useTasksMutation(organizationId);
  const uploads = useAttachmentUploads();
  const router = useRouter();
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
        const fields = { organizationId, projectEntityId: detail.project.entityId, ...draft };
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
                projectEntityId: detail.project.entityId,
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
