import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useRef } from "react";

import { ReferencePicker } from "../../context/references/reference-picker";
import { sendMessage } from "@/api/messaging/requests";
import { AttachFilesButton, AttachmentDraftList } from "@/components/attachments/attachment-picker";
import { FileDropZone } from "@/components/attachments/file-drop-zone";
import { useAttachmentUploads } from "@/components/attachments/use-attachment-uploads";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { Composer as ComposerView } from "@/components/messaging/composer/composer-view";
import { invalidateSentMessage } from "@/queries/messaging/mutations";

export function Composer(props: {
  organizationId: string;
  conversationId: string;
  threadId?: string;
  label: string;
}) {
  return (
    <DestinationComposer
      key={`${props.organizationId}:${props.conversationId}:${props.threadId ?? ""}`}
      {...props}
    />
  );
}

function DestinationComposer({
  organizationId,
  conversationId,
  threadId,
  label,
}: {
  organizationId: string;
  conversationId: string;
  threadId?: string;
  label: string;
}) {
  const queryClient = useQueryClient();
  const uploads = useAttachmentUploads();
  const request = useRef<{ id: string; body: string } | null>(null);
  const send = useMutation({
    mutationFn: async (body: string) => {
      const fingerprint = JSON.stringify([body, uploads.fileIds]);
      if (!request.current || request.current.body !== fingerprint)
        request.current = { id: crypto.randomUUID(), body: fingerprint };
      return sendMessage({
        data: {
          organizationId,
          conversationId,
          threadId,
          body,
          requestId: request.current.id,
          attachmentFileIds: uploads.fileIds,
        },
      });
    },
    onSuccess: (_, body) => {
      request.current = null;
      uploads.clear();
      return invalidateSentMessage(queryClient, organizationId, conversationId, body, threadId);
    },
  });
  return (
    <FileDropZone label="Message attachments" disabled={send.isPending} onFiles={uploads.add}>
      <UnsavedChangesGuard
        dirty={uploads.items.length > 0}
        name="Message attachments"
        description="Your selected files haven’t been sent."
      />
      <ComposerView
        draftKey={`${organizationId}:${conversationId}:${threadId ?? "channel"}`}
        label={label}
        hasAttachments={uploads.items.length > 0}
        attachmentsReady={!uploads.items.length || uploads.ready}
        attachmentControls={
          <AttachFilesButton iconOnly disabled={send.isPending} onFiles={uploads.add} />
        }
        attachmentDrafts={<AttachmentDraftList uploads={uploads} disabled={send.isPending} />}
        renderReferences={(activeReference, onInsert, onClose) => (
          <ReferencePicker
            organizationId={organizationId}
            conversationId={conversationId}
            activeReference={activeReference}
            onInsert={onInsert}
            onClose={onClose}
          />
        )}
        pending={send.isPending}
        error={send.error}
        onSend={(body, onSuccess) => {
          void send
            .mutateAsync(body)
            .then(onSuccess)
            .catch(() => {});
        }}
      />
    </FileDropZone>
  );
}
