import { useQuery } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { AttachmentList } from "./attachment-list";
import { AttachFilesButton, AttachmentDraftList } from "./attachment-picker";
import { FileDropZone } from "./file-drop-zone";
import { taskAttachmentUrl, type TaskAttachmentTarget } from "@/api/files/attachments";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ContentNotice } from "@/components/feedback/content-notice";
import { FormMessage } from "@/components/feedback/form-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { RecordSection } from "@/components/layout/record-section";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { SettingsNote } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { useTaskAttachmentMutations } from "@/queries/attachments/mutations";
import { taskAttachmentsOptions } from "@/queries/files/attachments";
import {
  useAttachmentUploads,
  type AttachmentUploads,
} from "@/queries/files/use-attachment-uploads";
import { Trash2 } from "lucide-react";

function TaskAttachmentDrafts({
  uploads,
  canAttach,
  pending,
  error,
  onAttach,
}: {
  uploads: AttachmentUploads;
  canAttach: boolean;
  pending: boolean;
  error: Error | null;
  onAttach: () => void;
}) {
  return (
    <>
      <AttachmentDraftList uploads={uploads} disabled={pending} />
      {!!uploads.items.length && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => uploads.clear()}>
            Cancel
          </Button>
          <PendingButton
            size="sm"
            pending={pending}
            disabled={!canAttach || !uploads.ready}
            onClick={onAttach}
          >
            Attach files to task
          </PendingButton>
        </div>
      )}
      <FormMessage
        error={error}
        errorDescription="Couldn’t attach these files. Your selection is still here. Try again."
      />
    </>
  );
}

function TaskAttachmentEmptyState({
  canEdit,
  hasDrafts,
}: {
  canEdit: boolean;
  hasDrafts: boolean;
}) {
  if (!canEdit) return <ContentNotice variant="inline" title="No attachments" />;
  if (hasDrafts) return null;
  return (
    <SettingsNote>
      Drop files here, or choose Attach files. Up to 10 files, 5 MiB each.
    </SettingsNote>
  );
}

export function TaskAttachments({
  target,
  canEdit,
  visible,
}: {
  target: TaskAttachmentTarget;
  canEdit: boolean;
  visible: boolean;
}) {
  const heading = useRef<HTMLSpanElement>(null);
  const options = taskAttachmentsOptions(target);
  const query = useQuery({ ...options, enabled: visible });
  const uploads = useAttachmentUploads(query.data?.length ?? 0);
  const [removing, setRemoving] = useState<{ id: string; filename: string } | null>(null);
  const { add, remove } = useTaskAttachmentMutations(target);
  const canAttach = canEdit && query.isSuccess;
  const canPick = canAttach && !add.isPending;
  return (
    <FileDropZone label="Task attachments" disabled={!canPick} onFiles={uploads.add}>
      <UnsavedChangesGuard
        dirty={uploads.items.length > 0}
        name="Task attachments"
        description="Your selected files haven’t been attached."
      />
      <RecordSection
        title={
          <span ref={heading} tabIndex={-1} className="rounded-sm outline-none">
            Attachments
          </span>
        }
        actions={
          canEdit && <AttachFilesButton iconOnly disabled={!canPick} onFiles={uploads.add} />
        }
      >
        {query.isPending && <LoadingState label="Loading attachments" variant="compact" rows={1} />}
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
        {query.isSuccess && !query.data.length && (
          <TaskAttachmentEmptyState canEdit={canEdit} hasDrafts={uploads.items.length > 0} />
        )}
        <TaskAttachmentDrafts
          uploads={uploads}
          canAttach={canAttach}
          pending={add.isPending}
          error={add.error}
          onAttach={() => add.mutate(uploads.fileIds, { onSuccess: () => uploads.clear() })}
        />
      </RecordSection>
      {removing && (
        <ConfirmDialog
          onClose={() => setRemoving(null)}
          onRestoreFocus={() => heading.current?.focus()}
          destructive
          title={`Remove ${removing.filename}?`}
          description="This removes the file from this task."
          confirmLabel="Remove attachment"
          pending={remove.isPending}
          error={remove.error}
          errorDescription="Couldn’t remove this attachment. Try again."
          onConfirm={() => remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
        />
      )}
    </FileDropZone>
  );
}
