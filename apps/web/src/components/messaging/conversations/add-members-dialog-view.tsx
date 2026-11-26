import { useState } from "react";

import { ShareHistoryField } from "./share-history-field";
import { useUnfinishedRecipient } from "./use-unfinished-recipient";
import { FormDialog } from "@/components/feedback/form-dialog";
import { PeoplePicker } from "@/components/people/people-picker";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
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
  const unfinishedRecipient = useUnfinishedRecipient("add-member-people");
  const unfinished = unfinishedRecipient.message;
  const invited = invitedRecipients(recipients).length;
  const title = name ? `Add people to ${name}` : "Add people";
  return (
    <FormDialog
      title={title}
      description="Members of this workspace join right away. Anyone else gets an invitation."
      saveLabel={recipients.length > 1 ? `Add ${recipients.length} people` : "Add people"}
      pending={pending}
      disabled={!recipients.length && !unfinishedRecipient.pendingText.trim()}
      status={recipients.length ? `${recipients.length} chosen` : "Choose people to add"}
      error={error}
      errorDescription="We couldn’t add these people. Check their email addresses and try again."
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={() => {
        if (unfinishedRecipient.refuse()) return;
        if (!recipients.length) {
          document.getElementById("add-member-people")?.focus();
          return;
        }
        onSubmit(recipients, invited > 0 && shareHistory);
      }}
    >
      <Field data-invalid={!!unfinished}>
        <FieldLabel htmlFor="add-member-people">People</FieldLabel>
        <PeoplePicker
          id="add-member-people"
          people={people}
          value={recipients}
          placeholder="Search people, or type an email to invite"
          disabled={pending}
          invalid={!!unfinished}
          describedBy={unfinished ? "add-member-people-error" : undefined}
          onValueChange={setRecipients}
          onPendingTextChange={unfinishedRecipient.onPendingTextChange}
        />
        {unfinished && <FieldError id="add-member-people-error">{unfinished}</FieldError>}
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
