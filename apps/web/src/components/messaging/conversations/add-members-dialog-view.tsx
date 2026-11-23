import { useState } from "react";

import { Field, FieldError, FieldLabel } from "../../ui/field";
import { ShareHistoryField } from "./share-history-field";
import { FormDialog } from "@/components/feedback/form-dialog";
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
    <FormDialog
      title={title}
      description="Members of this workspace join right away. Anyone else gets an invitation."
      saveLabel={recipients.length > 1 ? `Add ${recipients.length} people` : "Add people"}
      pending={pending}
      disabled={!recipients.length && !pendingText.trim()}
      status={recipients.length ? `${recipients.length} chosen` : "Choose people to add"}
      error={error}
      errorDescription="We couldn’t add these people. Check their email addresses and try again."
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={() => {
        const field = document.getElementById("add-member-people");
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
    </FormDialog>
  );
}
