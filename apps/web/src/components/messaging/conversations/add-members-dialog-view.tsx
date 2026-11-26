import type {
  PickedRecipient,
  PickerAgent,
  PickerPerson,
} from "@substrate/contracts/people/picker";

import { useState } from "react";

import { ShareHistoryField } from "./share-history-field";
import { useUnfinishedRecipient } from "./use-unfinished-recipient";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { FormDialog } from "@/components/feedback/form-dialog";
import { PeoplePicker } from "@/components/people/people-picker";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { AddMembersError } from "@/lib/messaging/add-members";
import { invitedRecipients, recipientKey } from "@/lib/people/people-picker";

export function AddMembersDialog({
  name,
  channel,
  people,
  agents,
  allowEmail = true,
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
  agents?: readonly PickerAgent[];
  allowEmail?: boolean;
  onSubmit: (
    recipients: PickedRecipient[],
    shareHistory: boolean,
    onPartial: (completed: PickedRecipient[]) => void,
  ) => void;
  pending?: boolean;
  error?: Error | null;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const [recipients, setRecipients] = useState<PickedRecipient[]>([]);
  const [shareHistory, setShareHistory] = useState(false);
  const unfinishedRecipient = useUnfinishedRecipient("add-member-people");
  const unfinished =
    !allowEmail && unfinishedRecipient.message
      ? "Choose an agent from the list, or clear your search."
      : unfinishedRecipient.message;
  const invited = invitedRecipients(recipients).length;
  const title = name ? `Add people to ${name}` : "Add people";
  return (
    <FormDialog
      title={title}
      description={
        allowEmail
          ? "Workspace members and your agents join right away. Anyone else gets an invitation."
          : "Add your agents here. They read with your access and run on your desktop."
      }
      saveLabel={recipients.length > 1 ? `Add ${recipients.length} people` : "Add people"}
      pending={pending}
      disabled={!recipients.length && !unfinishedRecipient.pendingText.trim()}
      status={recipients.length ? `${recipients.length} chosen` : "Choose people to add"}
      error={error}
      errorDescription={
        error instanceof AddMembersError
          ? `${error.completed.length ? `${error.completed.length} added. ` : ""}${actionErrorMessage(
              error.cause instanceof Error ? error.cause : new Error(),
              "We couldn’t add everyone. Review the remaining people and try again.",
            )}`
          : "We couldn’t load people to add. Try again."
      }
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={() => {
        if (unfinishedRecipient.refuse()) return;
        if (!recipients.length) {
          document.getElementById("add-member-people")?.focus();
          return;
        }
        onSubmit(recipients, invited > 0 && shareHistory, (added) => {
          const completed = new Set(added.map(recipientKey));
          setRecipients((selected) =>
            selected.filter((entry) => !completed.has(recipientKey(entry))),
          );
        });
      }}
    >
      <Field data-invalid={!!unfinished}>
        <FieldLabel htmlFor="add-member-people">People</FieldLabel>
        <PeoplePicker
          id="add-member-people"
          people={people}
          agents={agents}
          allowEmail={allowEmail}
          value={recipients}
          placeholder={
            allowEmail ? "Search people, or type an email to invite" : "Search your agents"
          }
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
