import type { ConversationDraft } from "@substrate/contracts/messaging/drafts";
import { messagingLimits } from "@substrate/contracts/messaging/input";
import type { PickedRecipient, PickerPerson } from "@substrate/contracts/people/picker";

import { useState } from "react";

import { RecipientField } from "./recipient-field";
import { ShareHistoryField } from "./share-history-field";
import {
  createConversationProblem,
  invitedRecipients,
} from "@/features/messaging/conversations/recipients";
import { countLabel } from "@/features/messaging/format";
import type { ConversationKind } from "@/features/messaging/types";
import { SwitchField, TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";

const titles = { dm: "New direct message", group: "New group message", channel: "New channel" };
const recipientLabels = { dm: "To", group: "People", channel: "Add people (optional)" };

export function CreateConversationForm({
  kind,
  people,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  kind: ConversationKind;
  people: readonly PickerPerson[];
  pending: boolean;
  error: unknown;
  onSubmit: (values: ConversationDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [recipients, setRecipients] = useState<PickedRecipient[]>([]);
  const [isPrivate, setPrivate] = useState(false);
  const [shareHistory, setShareHistory] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const problem = createConversationProblem(kind, { name, recipients });
  const invited = invitedRecipients(recipients).length;
  const shown = submitted ? problem : undefined;
  return (
    <FormSheet
      title={titles[kind]}
      saveLabel={kind === "channel" ? "Create" : "Start"}
      dirty={!!name.trim() || recipients.length > 0}
      pending={pending}
      error={error}
      onClose={onClose}
      onSave={() => {
        setSubmitted(true);
        if (!problem)
          onSubmit({ name, recipients, isPrivate, shareHistory: invited > 0 && shareHistory });
      }}
    >
      {kind !== "dm" ? (
        <TextField
          label={kind === "channel" ? "Channel name" : "Group name (optional)"}
          value={name}
          onChange={setName}
          maxLength={80}
          autoCapitalize="none"
          error={shown?.field === "name" ? shown.message : undefined}
          placeholder={kind === "channel" ? "launch-plans" : undefined}
        />
      ) : null}
      {kind === "channel" ? (
        <SwitchField
          label="Private channel"
          description="Only invited members can find and read it."
          checked={isPrivate}
          onChange={setPrivate}
        />
      ) : null}
      <RecipientField
        label={recipientLabels[kind]}
        people={people}
        value={recipients}
        max={kind === "dm" ? 1 : messagingLimits.recipients}
        disabled={pending}
        error={shown?.field === "recipients" ? shown.message : undefined}
        onChange={setRecipients}
      />
      {invited > 0 ? (
        <ShareHistoryField
          summary={`${countLabel(invited, "person isn't", "people aren't")} in this workspace. They get an email invitation and join after they accept${kind === "channel" ? ". Their organization must also approve." : "."}`}
          checked={shareHistory}
          disabled={pending}
          onChange={setShareHistory}
        />
      ) : null}
    </FormSheet>
  );
}
