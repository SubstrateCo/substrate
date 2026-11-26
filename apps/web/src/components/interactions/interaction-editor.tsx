import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { useState, type ReactNode } from "react";

import { interactionTypes } from "./interaction-types";
import { formText } from "@/components/crm/form-text";
import { FormDialog } from "@/components/feedback/form-dialog";
import { NativeField } from "@/components/forms/native-form";
import { SelectField } from "@/components/forms/select-field";

export function InteractionEditor({
  pending,
  error,
  onClose,
  onSubmit,
  contactField,
  canSubmit = true,
}: {
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (draft: {
    kind: InteractionKind;
    occurredAt: string;
    endedAt: string | null;
    summary: string;
  }) => void;
  contactField?: ReactNode;
  canSubmit?: boolean;
}) {
  const [kind, setKind] = useState<InteractionKind>("call");
  return (
    <FormDialog
      title="New interaction"
      description="Record a past customer touch. This summary is visible to people who can read this contact."
      saveLabel="Create interaction"
      nativeValidation
      disabled={!canSubmit}
      pending={pending}
      error={error}
      errorDescription="Couldn’t save this interaction. Check the fields and try again."
      onClose={onClose}
      onSubmit={(form) =>
        onSubmit({
          kind,
          occurredAt: new Date(formText(form, "occurredAt")).toISOString(),
          endedAt: formText(form, "endedAt")
            ? new Date(formText(form, "endedAt")).toISOString()
            : null,
          summary: formText(form, "summary"),
        })
      }
    >
      {contactField}
      <SelectField label="Kind" value={kind} onChange={setKind} options={kinds} />
      <NativeField
        id="interaction-occurred"
        name="occurredAt"
        label="Occurred at"
        type="datetime-local"
        required
        missingMessage="Choose when it happened."
      />
      <NativeField
        id="interaction-ended"
        name="endedAt"
        label="Ended at (optional)"
        type="datetime-local"
        description="Used for recorded meeting and call duration."
      />
      <NativeField
        id="interaction-summary"
        name="summary"
        label="Summary"
        multiline
        required
        missingMessage="Enter a summary."
        maxLength={10000}
      />
    </FormDialog>
  );
}

const kinds = (["call", "meeting", "email", "message", "note", "other"] as const).map((value) => ({
  value,
  label: interactionTypes[value].label,
}));
