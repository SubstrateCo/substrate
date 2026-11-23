import { useState } from "react";

import type { MessageContextState } from "../../context/references/message-context";
import { ReferencePicker } from "../../context/references/reference-picker";
import { useMessageReferences } from "../../context/references/use-message-references";
import type { Message } from "@/api/messaging/requests";
import {
  ComposerDraftReferences,
  ComposerDrafts,
} from "@/components/messaging/composer/composer-draft-context";
import { Composer } from "@/components/messaging/composer/composer-view";
import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import { Button } from "@/components/ui/button";
import { useMessageMutations } from "@/queries/messaging/message-mutations";

const draftKey = "edit";

/** Edits a message in place with the message composer. */
export function EditMessageComposer({
  organizationId,
  message,
  context,
  onClose,
}: {
  organizationId: string;
  message: Message;
  context: MessageContextState;
  onClose: () => void;
}) {
  const [body, setBody] = useState(message.body);
  const existing = useMessageReferences(organizationId, context);
  // The composer reads these once on mount, so the message's chips render before any edit.
  const [references] = useState(
    () => new Map<string, WorkspaceReference[]>([[draftKey, existing]]),
  );
  const { edit } = useMessageMutations(organizationId, message.conversationId, message.id);
  const cancel = () => {
    if (!edit.isPending) onClose();
  };
  return (
    <ComposerDrafts
      value={{
        get: () => body,
        set: (_key, value) => setBody(value),
        clear: () => {},
      }}
    >
      <ComposerDraftReferences value={references}>
        <Composer
          className="px-0 pt-1 pb-1"
          draftKey={draftKey}
          label="Edit message"
          autoFocus
          hasAttachments={message.attachments.length > 0}
          submitLabel="Save"
          errorDescription="Your message couldn’t be updated. Try again."
          submitDisabled={body.trim() === message.body}
          pending={edit.isPending}
          error={edit.error}
          onCancel={cancel}
          secondaryAction={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={edit.isPending}
              onClick={cancel}
            >
              Cancel
            </Button>
          }
          renderReferences={(activeReference, onInsert, onCloseReferences) => (
            <ReferencePicker
              organizationId={organizationId}
              conversationId={message.conversationId}
              activeReference={activeReference}
              onInsert={onInsert}
              onClose={onCloseReferences}
            />
          )}
          onSend={(next) => edit.mutate(next, { onSuccess: onClose })}
        />
      </ComposerDraftReferences>
    </ComposerDrafts>
  );
}
