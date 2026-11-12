import { useState } from "react";

import type { MessageRecordDraft } from "@/api/context/crm-from-message-input";
import type { CrmKind } from "@/components/crm/crm-types";
import { RecordEditor } from "@/components/crm/record-editor";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

export function MessageRecordEditor({
  organizationId,
  kind,
  stages,
  defaultCurrency,
  pending,
  error,
  onConfirm,
  onClose,
  onRestoreFocus,
}: {
  organizationId: string;
  kind: CrmKind;
  stages: { value: string; label: string }[];
  defaultCurrency?: string | null;
  pending: boolean;
  error: Error | null;
  onConfirm: (draft: MessageRecordDraft) => void;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const [draft, setDraft] = useState<MessageRecordDraft | null>(null);
  const singular = { accounts: "account", contacts: "contact", deals: "deal" }[kind];
  if (draft)
    return (
      <ConfirmDialog
        title={`Create ${singular} from this message?`}
        description="The fields you entered become visible to this CRM record’s readers and workspace admins. They can remain visible after the message is restricted or deleted. The private message stays separately restricted. Creating the record saves a source reference; removing a discussion association does not remove that provenance."
        confirmLabel={`Create ${singular} and save source`}
        pendingLabel="Creating…"
        pending={pending}
        error={error}
        errorDescription="Couldn’t create this record from the message. Check your access and try again."
        onConfirm={() => onConfirm(draft)}
        onClose={onClose}
        onRestoreFocus={onRestoreFocus}
      />
    );
  return (
    <RecordEditor
      kind={kind}
      organizationId={organizationId}
      accounts={[]}
      contacts={[]}
      stages={stages}
      defaultCurrency={defaultCurrency}
      pending={pending}
      error={error}
      onClose={onClose}
      onSubmit={(write) => {
        if (
          write.action === "createAccount" ||
          write.action === "createContact" ||
          write.action === "createDeal"
        )
          setDraft(write);
      }}
    />
  );
}
