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
  unfinishedRecipientMessage,
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
  const [pendingText, setPendingText] = useState("");
  const [refused, setRefused] = useState(false);
  const invited = invitedRecipients(recipients).length;
  const unfinished = refused ? unfinishedRecipientMessage(pendingText) : undefined;
  const errorMessage = unfinished ?? (missing ? "Choose at least one person." : undefined);
  let title = "Add people";
  if (name) title = `Add people to ${name}`;
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
            const field = event.currentTarget.querySelector<HTMLInputElement>("#add-member-people");
            // Text left in the field is never dropped silently.
            if (unfinishedRecipientMessage(pendingText)) {
              setRefused(true);
              field?.focus();
              return;
            }
            if (!recipients.length) {
              setMissing(true);
              field?.focus();
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
            <Field data-invalid={!!errorMessage}>
              <FieldLabel htmlFor="add-member-people">People</FieldLabel>
              <PeoplePicker
                id="add-member-people"
                people={people}
                value={recipients}
                placeholder="Search people, or type an email to invite"
                disabled={pending}
                invalid={!!errorMessage}
                describedBy={errorMessage ? "add-member-people-error" : undefined}
                onValueChange={(value) => {
                  setRecipients(value);
                  if (value.length) setMissing(false);
                }}
                onPendingTextChange={(text) => {
                  setPendingText(text);
                  setRefused(false);
                }}
              />
              {errorMessage && <FieldError id="add-member-people-error">{errorMessage}</FieldError>}
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
