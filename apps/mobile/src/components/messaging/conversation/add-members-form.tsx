import { messagingLimits } from "@substrate/contracts/messaging/input";
import type { PickedRecipient, PickerPerson } from "@substrate/contracts/people/picker";

import { useState } from "react";

import { RecipientField } from "../conversation-list/recipient-field";
import { ShareHistoryField } from "../conversation-list/share-history-field";
import { invitedRecipients } from "@/features/messaging/conversations/recipients";
import { countLabel } from "@/features/messaging/format";
import { FormSheet } from "@/features/records/ui/sheet";

export function AddMembersForm({
  name,
  channel,
  people,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  name: string;
  channel: boolean;
  people: readonly PickerPerson[];
  pending: boolean;
  error: Error | null;
  onSubmit: (recipients: PickedRecipient[], shareHistory: boolean) => void;
  onClose: () => void;
}) {
  const [recipients, setRecipients] = useState<PickedRecipient[]>([]);
  const [shareHistory, setShareHistory] = useState(false);
  const invited = invitedRecipients(recipients).length;
  return (
    <FormSheet
      title={`Add people to ${name}`}
      saveLabel="Add"
      dirty={recipients.length > 0}
      canSave={recipients.length > 0}
      pending={pending}
      error={error}
      onClose={onClose}
      onSave={() => onSubmit(recipients, invited > 0 && shareHistory)}
    >
      <RecipientField
        label="People"
        people={people}
        value={recipients}
        max={messagingLimits.recipients}
        disabled={pending}
        onChange={setRecipients}
      />
      {invited > 0 ? (
        <ShareHistoryField
          summary={`${countLabel(invited, "person isn't", "people aren't")} in this workspace. They get an email invitation and join after they accept${channel ? ". Their organization must also approve." : "."}`}
          checked={shareHistory}
          disabled={pending}
          onChange={setShareHistory}
        />
      ) : null}
    </FormSheet>
  );
}
