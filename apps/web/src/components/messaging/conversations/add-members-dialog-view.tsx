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
  onRestoreFocus,
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
  onRestoreFocus?: () => void;
}) {
  const [recipients, setRecipients] = useState<PickedRecipient[]>([]);
  const [shareHistory, setShareHistory] = useState(false);
  const [pendingText, setPendingText] = useState("");
  const [refused, setRefused] = useState(false);
  const invited = invitedRecipients(recipients).length;
  const unfinished = refused ? unfinishedRecipientMessage(pendingText) : undefined;
  const errorMessage = unfinished;
  let title = "Add people";
  if (name) title = `Add people to ${name}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!onRestoreFocus) return;
          event.preventDefault();
          onRestoreFocus();
        }}
      >
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
                onValueChange={setRecipients}
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
          <DialogFooter className="items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {recipients.length ? `${recipients.length} chosen` : "Choose people to add"}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
                Cancel
              </Button>
              <PendingButton
                type="submit"
                pending={pending}
                pendingLabel="Adding…"
                // Text still in the field is added, or explained, by the submit.
                disabled={!recipients.length && !pendingText.trim()}
              >
                {recipients.length > 1 ? `Add ${recipients.length} people` : "Add people"}
              </PendingButton>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
