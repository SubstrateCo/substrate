import { useRouter } from "@tanstack/react-router";

import { AttachFilesButton, AttachmentDraftList } from "@/components/attachments/attachment-picker";
import { FileDropZone } from "@/components/attachments/file-drop-zone";
import { useAttachmentUploads } from "@/components/attachments/use-attachment-uploads";
import { TaskForm as TaskFormView } from "@/components/tasks/editor/task-form-view";
import type { ProjectDetail, Task } from "@/components/tasks/types";
import { useTasksMutation } from "@/queries/tasks/mutations";

export function TaskForm({
  organizationId,
  detail,
  task,
  parentTaskEntityId,
  onSaved,
  onCancel,
  initialStatus,
  variant,
  onDirtyChange,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task?: Task;
  parentTaskEntityId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
  initialStatus?: Task["status"];
  variant?: "inline" | "dialog";
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
      variant={variant}
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
            <div className="grid gap-3 rounded-md border border-dashed p-3">
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
        void save
          .mutateAsync(
            task
              ? { action: "updateTask", ...fields, taskEntityId: task.entityId }
              : {
                  action: "createTask",
                  ...fields,
                  parentTaskEntityId,
                  attachmentFileIds: uploads.fileIds,
                },
          )
          .then(({ id }) => {
            if (router.latestLocation.href === destination) onSaved(id);
          })
          .catch(() => {});
      }}
    />
  );
}
