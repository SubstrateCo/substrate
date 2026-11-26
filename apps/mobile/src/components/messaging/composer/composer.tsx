import { messagingLimits } from "@substrate/contracts/messaging/input";

import { useState } from "react";

import { AttachmentDrafts } from "./attachment-drafts";
import { ComposerNotice, ComposerView } from "./composer-view";
import { ReferencePicker } from "./reference-picker";
import { ReferenceTextInput } from "./reference-text-input";
import { useReferenceEditing } from "./use-reference-editing";
import { draftKey } from "@/features/messaging/composer/draft-store";
import { pickDocuments, pickPhotos } from "@/features/messaging/composer/pick-files";
import { sendRequestFor } from "@/features/messaging/composer/send-request";
import { useAttachmentUploads } from "@/features/messaging/composer/use-attachment-uploads";
import { useStoredDraft } from "@/features/messaging/composer/use-stored-draft";
import { useSendMessage } from "@/features/messaging/queries/use-message-mutations";
import {
  bodyFromParts,
  partLabels,
  partsFromBody,
  type DraftPart,
} from "@/features/messaging/references/token-draft";
import { useMessagingScope } from "@/features/messaging/scope";
import { errorText, newRequestId } from "@/features/records/format";
import { ActionSheet } from "@/features/records/ui/sheet";

/**
 * Sends to a conversation or thread. The draft is kept per account, workspace, conversation and
 * thread. A failed send keeps the text and its request ID, so retrying cannot post twice.
 */
export function Composer({
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
  const { userId } = useMessagingScope(organizationId);
  const key = draftKey(userId, organizationId, conversationId, threadId);
  return (
    <DestinationComposer
      key={key}
      draftId={key}
      organizationId={organizationId}
      conversationId={conversationId}
      threadId={threadId}
      label={label}
    />
  );
}

function DestinationComposer({
  draftId,
  organizationId,
  conversationId,
  threadId,
  label,
}: {
  draftId: string;
  organizationId: string;
  conversationId: string;
  threadId?: string;
  label: string;
}) {
  const { draft, update, read } = useStoredDraft(draftId);
  const uploads = useAttachmentUploads();
  const send = useSendMessage(organizationId, conversationId, threadId);
  const [attaching, setAttaching] = useState(false);
  const [pickError, setPickError] = useState<string>();
  const parts = partsFromBody(draft.body, draft.labels);
  const body = bodyFromParts(parts).trim();
  const tooLong = body.length > messagingLimits.body;
  const canSend = (!!body || uploads.items.length > 0) && uploads.ready && !tooLong;

  const setParts = (next: DraftPart[]) =>
    update((current) => ({
      ...current,
      body: bodyFromParts(next),
      labels: { ...current.labels, ...partLabels(next) },
    }));
  const {
    query,
    caretRequest,
    setCaret,
    pick: pickReference,
  } = useReferenceEditing(parts, setParts);

  const submit = () => {
    if (!canSend || send.isPending) return;
    const fileIds = uploads.fileIds;
    const request = sendRequestFor(read().request, body, fileIds, newRequestId);
    update((current) => ({ ...current, request }));
    send.mutate(
      { body, attachmentFileIds: fileIds, requestId: request.id },
      {
        onSuccess: () => {
          uploads.clear();
          // Text typed while sending stays as the next draft.
          update((current) => {
            if (current.request?.id !== request.id) return current;
            return current.body.trim() === body
              ? { body: "", labels: {} }
              : { body: current.body, labels: current.labels };
          });
        },
      },
    );
  };

  const pick = async (picker: () => Promise<Parameters<typeof uploads.add>[0]>) => {
    try {
      setPickError(undefined);
      uploads.add(await picker());
    } catch {
      setPickError("Couldn't open your files. Check the app's access in Settings.");
    }
  };

  let notice;
  if (send.error)
    notice = (
      <ComposerNotice tone="error">{`${errorText(send.error, "Couldn't send.")} Your message is kept. Send again to retry.`}</ComposerNotice>
    );
  else if (tooLong)
    notice = (
      <ComposerNotice tone="error">{`Messages can be up to ${messagingLimits.body.toLocaleString()} characters.`}</ComposerNotice>
    );
  else if (uploads.limitError ?? pickError)
    notice = <ComposerNotice tone="error">{(uploads.limitError ?? pickError)!}</ComposerNotice>;

  return (
    <>
      <ComposerView
        picker={
          query ? (
            <ReferencePicker
              organizationId={organizationId}
              conversationId={conversationId}
              query={query}
              onPick={pickReference}
            />
          ) : undefined
        }
        attachments={
          <AttachmentDrafts
            items={uploads.items}
            disabled={send.isPending}
            onRetry={(key) => uploads.retry(key)}
            onRemove={(key) => uploads.remove(key)}
          />
        }
        notice={notice}
        input={
          <ReferenceTextInput
            parts={parts}
            label={label}
            placeholder={label}
            editable={!send.isPending}
            caretRequest={caretRequest}
            onChange={setParts}
            onCaret={setCaret}
          />
        }
        canSend={canSend}
        pending={send.isPending}
        onAttach={() => setAttaching(true)}
        onSend={submit}
      />
      {attaching ? (
        <ActionSheet
          title="Attach"
          onClose={() => setAttaching(false)}
          actions={[
            { label: "Photo library", onPress: () => void pick(pickPhotos) },
            { label: "Files", onPress: () => void pick(pickDocuments) },
          ]}
        />
      ) : null}
    </>
  );
}
