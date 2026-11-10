import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { AttachmentList } from "./attachment-list";
import { AttachFilesButton, AttachmentDraftList } from "./attachment-picker";
import { FileDropZone } from "./file-drop-zone";
import { useAttachmentUploads } from "./use-attachment-uploads";
import {
  attachTaskFiles,
  removeTaskAttachment,
  taskAttachmentUrl,
  type TaskAttachmentTarget,
} from "@/api/files/attachments";
import { FormMessage } from "@/components/auth/form-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { PendingButton } from "@/components/feedback/pending-button";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { Button } from "@/components/ui/button";
import { taskAttachmentsOptions } from "@/queries/files/attachments";
import { Trash2 } from "lucide-react";

export function TaskAttachments({
  target,
  canEdit,
  visible,
}: {
  target: TaskAttachmentTarget;
  canEdit: boolean;
  visible: boolean;
}) {
  const queryClient = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const options = taskAttachmentsOptions(target);
  const query = useQuery({ ...options, enabled: visible });
  const uploads = useAttachmentUploads(query.data?.length ?? 0);
  const [removing, setRemoving] = useState<{ id: string; filename: string } | null>(null);
  const add = useMutation({
    mutationFn: () => attachTaskFiles({ ...target, attachmentFileIds: uploads.fileIds }),
    onSuccess: async () => {
      uploads.clear();
      await queryClient.invalidateQueries({ queryKey: options.queryKey });
    },
  });
  const remove = useMutation({
    mutationFn: (attachmentId: string) => removeTaskAttachment({ ...target, attachmentId }),
    onSuccess: async () => {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: options.queryKey });
    },
  });
  return (
    <FileDropZone
      label="Task attachments"
      disabled={!canEdit || add.isPending || !query.isSuccess}
      onFiles={uploads.add}
    >
      <UnsavedChangesGuard
        dirty={uploads.items.length > 0}
        name="Task attachments"
        description="Your selected files haven’t been attached."
      />
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 ref={heading} tabIndex={-1} className="text-sm font-medium">
            Attachments
          </h3>
          {canEdit && (
            <AttachFilesButton disabled={!query.isSuccess || add.isPending} onFiles={uploads.add} />
          )}
        </div>
        {query.isPending && (
          <p className="text-sm text-muted-foreground" role="status">
            Loading attachments…
          </p>
        )}
        <FormMessage
          error={query.error}
          errorDescription="Couldn’t load attachments. Reopen the task to try again."
        />
        {query.isSuccess && (
          <AttachmentList
            attachments={query.data}
            href={(attachment) => taskAttachmentUrl({ ...target, attachmentId: attachment.id })}
            actions={
              canEdit
                ? (attachment) => (
                    <RowActions label={`Actions for ${attachment.filename}`}>
                      <RowAction
                        label={`Remove ${attachment.filename}`}
                        destructive
                        disabled={remove.isPending}
                        onClick={() => setRemoving(attachment)}
                      >
                        <Trash2 />
                      </RowAction>
                    </RowActions>
                  )
                : undefined
            }
          />
        )}
        {canEdit && query.isSuccess && !query.data.length && !uploads.items.length && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Drop files here, or choose Attach files. Up to 10 files, 5 MiB each.
          </p>
        )}
        {!canEdit && query.isSuccess && !query.data.length && (
          <p className="text-sm text-muted-foreground">No attachments</p>
        )}
        <AttachmentDraftList uploads={uploads} disabled={add.isPending} />
        {!!uploads.items.length && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={add.isPending}
              onClick={() => uploads.clear()}
            >
              Cancel
            </Button>
            <PendingButton
              size="sm"
              pending={add.isPending}
              pendingLabel="Attaching…"
              disabled={!canEdit || !query.isSuccess || !uploads.ready}
              onClick={() => add.mutate()}
            >
              Attach files to task
            </PendingButton>
          </div>
        )}
        <FormMessage
          error={add.error}
          errorDescription="Couldn’t attach these files. Your selection is still here. Try again."
        />
      </div>
      {removing && (
        <ConfirmDialog
          onClose={() => setRemoving(null)}
          onRestoreFocus={() => heading.current?.focus()}
          destructive
          title={`Remove ${removing.filename}?`}
          description="This removes the file from this task."
          confirmLabel="Remove attachment"
          pendingLabel="Removing…"
          pending={remove.isPending}
          error={remove.error}
          errorDescription="Couldn’t remove this attachment. Try again."
          onConfirm={() => remove.mutate(removing.id)}
        />
      )}
    </FileDropZone>
  );
}
