import { useState } from "react";

import { RecordPickerField } from "@/components/crm/record-picker";
import {
  interactionKindLabels,
  interactionKinds,
  localInstant,
  nowTime,
  todayDate,
  validDate,
  type InteractionKind,
} from "@/features/records/format";
import { interactionMinutes } from "@/features/records/interaction-duration";
import { SelectField, TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";
import type { QueryScope } from "@/queries/keys";

export type InteractionDraft = {
  contactEntityId: string;
  kind: InteractionKind;
  occurredAt: string;
  endedAt: string | null;
  summary: string;
};

const kinds = interactionKinds.map((value) => ({ value, label: interactionKindLabels[value] }));

/** Logs a call, meeting or note against a contact. The contact's readers can see it. */
export function InteractionForm({
  scope,
  contact,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  scope: QueryScope;
  contact?: { entityId: string; name: string };
  pending: boolean;
  error: Error | null;
  onSubmit: (draft: InteractionDraft) => void;
  onClose: () => void;
}) {
  const [contactId, setContactId] = useState<string | null>(contact?.entityId ?? null);
  const [kind, setKind] = useState<InteractionKind>("note");
  const [date, setDate] = useState(todayDate);
  const [time, setTime] = useState(nowTime);
  const [minutes, setMinutes] = useState("");
  const [summary, setSummary] = useState("");
  const start = localInstant(date, time);
  const duration = interactionMinutes(kind, minutes);
  const validDuration = duration !== null;
  const timed = kind === "meeting" || kind === "call";
  return (
    <FormSheet
      title="Log interaction"
      description="Everyone who can read this contact can read the interaction."
      saveLabel="Log"
      dirty={summary.length > 0 || minutes.length > 0}
      pending={pending}
      canSave={!!contactId && !!start && summary.trim().length > 0 && validDuration}
      error={error}
      onClose={onClose}
      onSave={() => {
        if (!contactId || !start) return;
        onSubmit({
          contactEntityId: contactId,
          kind,
          occurredAt: start.toISOString(),
          endedAt:
            timed && duration ? new Date(start.getTime() + duration * 60_000).toISOString() : null,
          summary: summary.trim(),
        });
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
      <SelectField label="Type" value={kind} onChange={setKind} choices={kinds} />
      <TextField
        label="Date"
        value={date}
        onChange={setDate}
        placeholder="YYYY-MM-DD"
        maxLength={10}
        keyboardType="numbers-and-punctuation"
        error={validDate(date) ? null : "Use a real date, like 2026-12-31."}
      />
      <TextField
        label="Time"
        value={time}
        onChange={setTime}
        placeholder="HH:MM"
        maxLength={5}
        keyboardType="numbers-and-punctuation"
        description="Your local time."
        error={start || !validDate(date) ? null : "Use 24-hour time, like 14:30."}
      />
      {timed ? (
        <TextField
          label="Duration in minutes"
          value={minutes}
          onChange={setMinutes}
          keyboardType="number-pad"
          maxLength={4}
          error={validDuration ? null : "Use a whole number of minutes."}
        />
      ) : null}
      <TextField
        label="Summary"
        value={summary}
        onChange={setSummary}
        multiline
        maxLength={10000}
        placeholder="What happened?"
      />
    </FormSheet>
  );
}

export function InteractionSummaryForm({
  summary: initial,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  summary: string;
  pending: boolean;
  error: Error | null;
  onSubmit: (summary: string) => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState(initial);
  return (
    <FormSheet
      title="Edit summary"
      dirty={summary !== initial}
      pending={pending}
      canSave={summary.trim().length > 0}
      error={error}
      onClose={onClose}
      onSave={() => onSubmit(summary.trim())}
    >
      <TextField
        label="Summary"
        value={summary}
        onChange={setSummary}
        multiline
        maxLength={10000}
        autoFocus
      />
    </FormSheet>
  );
}
