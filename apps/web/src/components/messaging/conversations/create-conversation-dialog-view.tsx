import { revalidateLogic, useForm, useSelector } from "@tanstack/react-form";

import { useState } from "react";

import { Checkbox } from "../../ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "../../ui/field";
import { createConversationDraftSchema } from "./create-conversation-validation";
import { ShareHistoryField } from "./share-history-field";
import { FormDialog } from "@/components/feedback/form-dialog";
import { FormTextField } from "@/components/forms/form-text-field";
import { PeoplePicker } from "@/components/people/people-picker";
import type { Conversation } from "@/lib/messaging/conversations";
import {
  invitedRecipients,
  unfinishedRecipientMessage,
  type PickedRecipient,
  type PickerPerson,
} from "@/lib/people/people-picker";

export type ConversationDraft = {
  name: string;
  recipients: PickedRecipient[];
  isPrivate: boolean;
  shareHistory: boolean;
};

const copy = {
  channel: {
    title: "New channel",
    description: "A place for your team to talk about one topic.",
    submit: "Create channel",
  },
  dm: {
    title: "New direct message",
    description: "Message one person. Only the two of you can read it.",
    submit: "Start conversation",
  },
  group: {
    title: "New group message",
    description: "A private conversation with several people.",
    submit: "Start conversation",
  },
};

const minimumRecipients: Record<Conversation["kind"], number> = { channel: 0, dm: 1, group: 2 };

function recipientStatus(kind: Conversation["kind"], chosen: number) {
  if (kind === "dm") return "Choose a person";
  return chosen === 1 ? "Choose one more person" : "Choose at least two people";
}

export function CreateConversationDialog({
  kind,
  people,
  onSubmit,
  onClose,
  onRestoreFocus,
  pending = false,
  error,
}: {
  kind: Conversation["kind"];
  /** People to suggest, without the viewer. */
  people: readonly PickerPerson[];
  onSubmit: (draft: ConversationDraft) => void;
  onClose: () => void;
  /** Focus the control that opened the dialog, which the dialog cannot find by itself. */
  onRestoreFocus?: () => void;
  pending?: boolean;
  error?: Error | null;
}) {
  const [shareHistory, setShareHistory] = useState(false);
  // Text left in the people field. A submit with text left is refused, so nothing typed is dropped.
  const [pendingText, setPendingText] = useState("");
  const [refused, setRefused] = useState(false);
  const recipients: PickedRecipient[] = [];
  const form = useForm({
    defaultValues: { name: "", recipients, isPrivate: false },
    // Moving between fields shows no errors; after a submit, errors clear as soon as fixed.
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: { onDynamic: createConversationDraftSchema(kind) },
    onSubmit: ({ value }) => {
      if (pending) return;
      const invited = invitedRecipients(value.recipients).length > 0;
      onSubmit({ ...value, shareHistory: invited && shareHistory });
    },
  });
  const text = copy[kind];
  const chosen = useSelector(form.store, (state) => state.values.recipients.length);
  const missing = Math.max(0, minimumRecipients[kind] - chosen);
  const limit = kind === "dm" ? "Choose one person for a direct message." : undefined;
  const nameField = kind !== "dm" && (
    <form.Field name="name">
      {(field) => (
        <FormTextField
          field={field}
          id="conversation-name"
          label={kind === "channel" ? "Channel name" : "Group name (optional)"}
          placeholder={
            kind === "channel" ? "For example: product-updates" : "For example: Launch team"
          }
          maxLength={80}
          disabled={pending}
          required={kind === "channel"}
        />
      )}
    </form.Field>
  );
  return (
    <FormDialog
      title={text.title}
      description={text.description}
      saveLabel={text.submit}
      pending={pending}
      disabled={missing > 0 && !pendingText.trim()}
      status={missing > 0 ? recipientStatus(kind, chosen) : null}
      error={error}
      errorDescription="We couldn’t create this conversation. Check the people and try again."
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={() => {
        if (unfinishedRecipientMessage(pendingText, limit)) {
          setRefused(true);
          document.getElementById("conversation-recipients")?.focus();
          return;
        }
        return form.handleSubmit();
      }}
    >
      {kind === "channel" && nameField}
      <form.Field name="recipients">
        {(field) => {
          const unfinished = refused ? unfinishedRecipientMessage(pendingText, limit) : undefined;
          const invalid = !field.state.meta.isValid || !!unfinished;
          const invited = invitedRecipients(field.state.value).length;
          return (
            <>
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor="conversation-recipients">
                  {kind === "channel" ? "Members" : "To"}
                </FieldLabel>
                <PeoplePicker
                  id="conversation-recipients"
                  people={people}
                  value={field.state.value}
                  max={kind === "dm" ? 1 : undefined}
                  limitText={limit}
                  placeholder={
                    kind === "dm"
                      ? "Search by name or email"
                      : "Search people, or type an email to invite"
                  }
                  disabled={pending}
                  invalid={invalid}
                  describedBy={invalid ? "conversation-recipients-error" : undefined}
                  onValueChange={field.handleChange}
                  onPendingTextChange={(text) => {
                    setPendingText(text);
                    setRefused(false);
                  }}
                  onBlur={field.handleBlur}
                />
                {unfinished ? (
                  <FieldError id="conversation-recipients-error">{unfinished}</FieldError>
                ) : (
                  invalid && (
                    <FieldError
                      id="conversation-recipients-error"
                      errors={field.state.meta.errors}
                    />
                  )
                )}
              </Field>
              {invited > 0 && (
                <ShareHistoryField
                  id="create-sharing-history"
                  invited={invited}
                  channel={kind === "channel"}
                  checked={shareHistory}
                  onCheckedChange={setShareHistory}
                  disabled={pending}
                />
              )}
            </>
          );
        }}
      </form.Field>
      {kind === "group" && nameField}
      {kind === "channel" && (
        <form.Field name="isPrivate">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                id="conversation-private"
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked === true)}
                onBlur={field.handleBlur}
                disabled={pending}
                aria-describedby="conversation-private-description"
              />
              <FieldContent>
                <FieldLabel htmlFor="conversation-private">Make this channel private</FieldLabel>
                <FieldDescription id="conversation-private-description">
                  Only people who are added can find and read it.
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        </form.Field>
      )}
    </FormDialog>
  );
}
