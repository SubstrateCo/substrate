import { useState } from "react";

import { AccountForm } from "./account-form";
import { DealForm } from "./deal-form";
import { ContactForm } from "@/components/contacts/contact-form";
import type { MessageRecordDraft } from "@/features/records/crm/crm-management";
import { useCrmFromMessage } from "@/features/records/crm/crm-queries";
import { newRequestId } from "@/features/records/format";
import { useRecordScope } from "@/features/records/queries";
import type { RecordTarget } from "@/features/records/types";
import { ConfirmSheet } from "@/features/records/ui/sheet";

export type MessageToCrmSheetProps = {
  organizationId: string;
  messageId: string;
  kind: "account" | "contact" | "deal";
  onClose: () => void;
  /** The new record, saved with the message as its source. */
  onCreated: (target: RecordTarget) => void;
};

/**
 * Creates an account, contact or deal from a message. The reader fills the fields, then confirms
 * that the record's readers may see them; the message stays separately restricted.
 */
export function MessageToCrmSheet({
  organizationId,
  messageId,
  kind,
  onClose,
  onCreated,
}: MessageToCrmSheetProps) {
  const scope = useRecordScope(organizationId);
  const create = useCrmFromMessage(scope);
  // One key for this form, so a retried save after a lost response doesn't create a second record.
  const [requestId] = useState(newRequestId);
  const [draft, setDraft] = useState<MessageRecordDraft | null>(null);
  let form;
  if (kind === "account")
    form = (
      <AccountForm
        pending={false}
        error={null}
        onClose={onClose}
        onSubmit={(fields) => setDraft({ kind: "account", fields })}
      />
    );
  else if (kind === "contact")
    form = (
      <ContactForm
        pending={false}
        error={null}
        onClose={onClose}
        onSubmit={(fields) => setDraft({ kind: "contact", fields })}
      />
    );
  else
    form = (
      <DealForm
        scope={scope}
        pending={false}
        error={null}
        onClose={onClose}
        onSubmit={(fields) => setDraft({ kind: "deal", fields })}
      />
    );
  return (
    <>
      {form}
      {draft ? (
        <ConfirmSheet
          title={`Create ${kind} from this message?`}
          description="The fields you entered become visible to this record's readers and workspace admins, and can stay visible after the message is restricted or deleted. The message itself stays restricted. The record keeps the message as its source."
          confirmLabel={`Create ${kind}`}
          pending={create.isPending}
          error={create.error}
          onCancel={() => {
            create.reset();
            setDraft(null);
          }}
          onConfirm={() =>
            create.mutate(
              { messageId, requestId, draft, consentToRecordAudience: true },
              {
                onSuccess: (result) => {
                  onClose();
                  onCreated({ kind: result.entityType, id: result.entityId });
                },
              },
            )
          }
        />
      ) : null}
    </>
  );
}
