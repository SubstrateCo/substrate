import { useContext } from "react";

import { ReferencePicker } from "../../context/references/reference-picker";
import { AttachFilesButton, AttachmentDraftList } from "@/components/attachments/attachment-picker";
import { FileDropZone } from "@/components/attachments/file-drop-zone";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { ComposerSendRequests } from "@/components/messaging/composer/composer-draft-context";
import { Composer as ComposerView } from "@/components/messaging/composer/composer-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useAttachmentUploads } from "@/queries/files/use-attachment-uploads";
import { useSendMessage } from "@/queries/messaging/messages";

export function Composer(props: { conversationId: string; threadId?: string; label: string }) {
  const { organizationId } = useWorkspaceScope();
  return (
    <DestinationComposer
      key={`${organizationId}:${props.conversationId}:${props.threadId ?? ""}`}
      organizationId={organizationId}
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
  const uploads = useAttachmentUploads();
  const requests = useContext(ComposerSendRequests);
  if (!requests) throw new Error("Composer requires ComposerDraftProvider");
  const draftKey = `${organizationId}:${conversationId}:${threadId ?? "channel"}`;
  const send = useSendMessage(organizationId, conversationId, threadId, () => uploads.clear());
  return (
    <div className="relative h-28 shrink-0">
      <FileDropZone
        label="Message attachments"
        disabled={send.isPending}
        onFiles={uploads.add}
        className="absolute inset-x-0 bottom-0 z-10"
      >
        <UnsavedChangesGuard
          dirty={uploads.items.length > 0}
          name="Message attachments"
          description="Your selected files haven’t been sent."
        />
        <ComposerView
          draftKey={draftKey}
          label={label}
          hasAttachments={uploads.items.length > 0}
          attachmentsReady={!uploads.items.length || uploads.ready}
          attachmentControls={
            <AttachFilesButton iconOnly disabled={send.isPending} onFiles={uploads.add} />
          }
          attachmentDrafts={
            <AttachmentDraftList uploads={uploads} disabled={send.isPending} compact />
          }
          onPasteFiles={uploads.add}
          renderReferences={(activeReference, onInsert) => (
            <ReferencePicker
              conversationId={conversationId}
              activeReference={activeReference}
              onInsert={onInsert}
            />
          )}
          pending={send.isPending}
          error={send.error}
          onSend={(body, onSuccess) => {
            const fingerprint = JSON.stringify([body, uploads.fileIds]);
            let request = requests.get(draftKey);
            if (!request || request.body !== fingerprint) {
              request = { id: crypto.randomUUID(), body: fingerprint };
              requests.set(draftKey, request);
            }
            const requestId = request.id;
            // Not `mutate` callbacks: they skip an unmounted composer, and switching conversations
            // while this sends must still clear the sent draft, which outlives this component.
            void send
              .mutateAsync({ body, attachmentFileIds: uploads.fileIds, requestId })
              .then(() => {
                if (requests.get(draftKey)?.id === requestId) requests.delete(draftKey);
                onSuccess();
              })
              .catch(() => {});
          }}
        />
      </FileDropZone>
    </div>
  );
}
