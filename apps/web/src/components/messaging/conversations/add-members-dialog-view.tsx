import { useState } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Field, FieldError, FieldLabel } from "../../ui/field";
import { ShareHistoryField } from "./share-history-field";
import { PeoplePicker } from "@/components/people/people-picker";
import {
  invitedRecipients,
  type PickedRecipient,
  type PickerPerson,
} from "@/lib/people/people-picker";

export function AddMembersDialog({
  name,
  channel,
  people,
  onSubmit,
  pending = false,
  error,
  onClose,
}: {
  /** The conversation's display name, when the viewer can see it. */
  name?: string;
  channel: boolean;
  /** People to suggest, without current members. */
  people: readonly PickerPerson[];
  onSubmit: (recipients: PickedRecipient[], shareHistory: boolean) => void;
  pending?: boolean;
  error?: Error | null;
  onClose: () => void;
}) {
  const [recipients, setRecipients] = useState<PickedRecipient[]>([]);
  const [missing, setMissing] = useState(false);
  const [shareHistory, setShareHistory] = useState(false);
  const invited = invitedRecipients(recipients).length;
  let title = "Add people";
  if (name) title = channel ? `Add people to #${name}` : `Add people to ${name}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            if (!recipients.length) {
              setMissing(true);
              event.currentTarget.querySelector<HTMLInputElement>("#add-member-people")?.focus();
              return;
            }
            onSubmit(recipients, invited > 0 && shareHistory);
          }}
        >
          <DialogHeader>
            <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
            <DialogDescription>
              Members of this workspace join right away. Anyone else gets an invitation.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field data-invalid={missing}>
              <FieldLabel htmlFor="add-member-people">People</FieldLabel>
              <PeoplePicker
                id="add-member-people"
                people={people}
                value={recipients}
                placeholder="Search people, or type an email to invite"
                disabled={pending}
                invalid={missing}
                describedBy={missing ? "add-member-people-error" : undefined}
                onValueChange={(value) => {
                  setRecipients(value);
                  if (value.length) setMissing(false);
                }}
              />
              {missing && (
                <FieldError id="add-member-people-error">Choose at least one person.</FieldError>
              )}
            </Field>
            {invited > 0 && (
              <ShareHistoryField
                id="add-sharing-history"
                invited={invited}
                channel={channel}
                checked={shareHistory}
                onCheckedChange={setShareHistory}
                disabled={pending}
              />
            )}
            <FormMessage
              error={error}
              errorDescription="We couldn’t add these people. Check their email addresses and try again."
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton type="submit" pending={pending} pendingLabel="Adding…">
              {recipients.length > 1 ? `Add ${recipients.length} people` : "Add people"}
            </PendingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
