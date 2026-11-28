import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { RecordPickerField } from "@/components/crm/record-picker";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { publicationSources } from "@/features/records/crm/crm-management";
import { crmQueries, usePublishInteraction } from "@/features/records/crm/crm-queries";
import {
  formatDateTime,
  interactionKindLabels,
  interactionKinds,
  localInstant,
  nowTime,
  todayDate,
  validDate,
} from "@/features/records/format";
import { useRecordScope } from "@/features/records/queries";
import type { OnOpenConversation } from "@/features/records/types";
import { SelectField, SwitchField, TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";
import { ErrorState } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";

export type PublishInteractionSheetProps = {
  organizationId: string;
  contact?: { entityId: string; name: string };
  messageId?: string;
  onOpenConversation?: OnOpenConversation;
  onClose: () => void;
  onPublished?: (interactionEntityId: string) => void;
};

export function PublishInteractionSheet({
  organizationId,
  contact,
  messageId: fixedMessageId,
  onOpenConversation,
  onClose,
  onPublished,
}: PublishInteractionSheetProps) {
  const scope = useRecordScope(organizationId);
  const write = usePublishInteraction(scope);
  const [contactId, setContactId] = useState<string | null>(contact?.entityId ?? null);
  const [messageId, setMessageId] = useState<string | null>(fixedMessageId ?? null);
  const [kind, setKind] = useState<InteractionKind>("message");
  const [date, setDate] = useState(todayDate);
  const [time, setTime] = useState(nowTime);
  const [summary, setSummary] = useState("");
  const [consent, setConsent] = useState(false);
  const occurredAt = localInstant(date, time);
  const ready = [contactId, messageId, occurredAt, summary.trim(), consent].every(Boolean);
  return (
    <FormSheet
      title="Record interaction from discussion"
      description="A message author is not automatically a customer identity. Confirm this interaction belongs to this contact."
      saveLabel="Publish"
      dirty={!!summary || consent}
      pending={write.isPending}
      canSave={ready}
      error={write.error}
      onClose={onClose}
      onSave={() => {
        if (!ready) return;
        if (!contactId || !messageId || !occurredAt) return;
        write.mutate(
          {
            contactEntityId: contactId,
            messageId,
            kind,
            occurredAt: occurredAt.toISOString(),
            summary: summary.trim(),
            consentToContactAudience: true,
          },
          {
            onSuccess: (result) => {
              onClose();
              if ("entityId" in result) onPublished?.(result.entityId);
            },
          },
        );
      }}
    >
      {contact ? null : (
        <RecordPickerField
          scope={scope}
          kind="contacts"
          label="Contact"
          value={contactId}
          allowNone={false}
          onChange={(value) => setContactId(value)}
        />
      )}
      {!fixedMessageId && contact ? (
        <SourcePicker
          scope={scope}
          contactEntityId={contact.entityId}
          value={messageId}
          onChange={setMessageId}
          onOpenConversation={onOpenConversation}
        />
      ) : null}
      <SelectField
        label="Type"
        value={kind}
        onChange={setKind}
        choices={interactionKinds.map((value) => ({ value, label: interactionKindLabels[value] }))}
      />
      <TextField
        label="Date"
        value={date}
        onChange={setDate}
        placeholder="YYYY-MM-DD"
        maxLength={10}
        error={validDate(date) ? null : "Use a real date, like 2026-12-31."}
      />
      <TextField
        label="Time"
        value={time}
        onChange={setTime}
        placeholder="HH:MM"
        maxLength={5}
        description="Your local time."
        error={occurredAt || !validDate(date) ? null : "Use 24-hour time, like 14:30."}
      />
      <TextField
        label="Approved summary"
        value={summary}
        onChange={setSummary}
        multiline
        maxLength={10000}
        description="Write only the customer facts you approve for everyone in the workspace."
      />
      <SwitchField
        label="Publish to the workspace"
        description="I approve this summary becoming visible to everyone in the workspace. It can stay visible after the source message is restricted or deleted."
        checked={consent}
        onChange={setConsent}
      />
    </FormSheet>
  );
}

function SourcePicker({
  scope,
  contactEntityId,
  value,
  onChange,
  onOpenConversation,
}: {
  scope: QueryScope;
  contactEntityId: string;
  value: string | null;
  onChange: (value: string) => void;
  onOpenConversation?: OnOpenConversation;
}) {
  const related = useQuery(crmQueries.relatedMessages(scope, contactEntityId));
  if (related.error)
    return (
      <ErrorState
        compact
        error={related.error}
        noun="linked messages"
        onRetry={() => void related.refetch()}
      />
    );
  const sources = publicationSources(related.data ?? []);
  const source = sources.find((row) => row.messageId === value);
  return (
    <>
      <SelectField
        label="Source message"
        value={value}
        onChange={onChange}
        loading={related.isPending}
        placeholder={related.isPending ? "Loading messages…" : "Choose a linked message"}
        description={
          related.isPending || sources.length
            ? undefined
            : "No linked messages you can read. Link a message to this contact first."
        }
        choices={sources.map((row) => ({
          value: row.messageId,
          label: row.body.split("\n")[0] || "Message",
          description: [row.authorName, row.conversationName, formatDateTime(row.createdAt)]
            .filter(Boolean)
            .join(" · "),
        }))}
      />
      {source && onOpenConversation ? (
        <Button
          variant="link"
          size="sm"
          className="self-start px-0"
          onPress={() => onOpenConversation(source.conversationId, source.messageId)}
        >
          <Text>Review source message</Text>
        </Button>
      ) : null}
    </>
  );
}
