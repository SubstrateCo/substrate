import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { useState, type ReactNode } from "react";

import { CrmSelect } from "@/components/crm/crm-select";
import { formText } from "@/components/crm/form-text";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function InteractionEditor({
  pending,
  error,
  onClose,
  onSubmit,
  contactField,
  canSubmit = true,
  submitLabel = "Record interaction",
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
  submitLabel?: string;
}) {
  const [kind, setKind] = useState<InteractionKind>("call");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New interaction</DialogTitle>
          <DialogDescription>
            Record a past customer touch. This summary is visible to people who can read this
            contact.
          </DialogDescription>
        </DialogHeader>
        <NativeForm
          pending={pending}
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
          <DialogBody>
            {contactField}
            <CrmSelect
              label="Kind"
              value={kind}
              onValueChange={(value) => {
                const choice = kinds.find((item) => item.value === value);
                if (choice) setKind(choice.value);
              }}
              options={kinds}
            />
            <NativeField
              id="interaction-occurred"
              name="occurredAt"
              label="Occurred at"
              type="datetime-local"
              required
            />
            <NativeField
              id="interaction-ended"
              name="endedAt"
              label="Ended at"
              type="datetime-local"
              description="Optional. Used for recorded meeting and call duration."
            />
            <NativeField
              id="interaction-summary"
              name="summary"
              label="Summary"
              required
              maxLength={10000}
            />
            <FormMessage
              error={error}
              errorDescription="Couldn’t save this interaction. Check the fields and try again."
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton
              type="submit"
              disabled={!canSubmit}
              pending={pending}
              pendingLabel="Recording…"
            >
              {submitLabel}
            </PendingButton>
          </DialogFooter>
        </NativeForm>
      </DialogContent>
    </Dialog>
  );
}

const kinds = [
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "email", label: "Email" },
  { value: "message", label: "Message" },
  { value: "note", label: "Internal note" },
  { value: "other", label: "Other" },
] satisfies { value: InteractionKind; label: string }[];
