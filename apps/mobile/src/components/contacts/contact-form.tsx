import { useState } from "react";

import { TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";

export type ContactDraft = {
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  notes: string | null;
};

export function ContactForm({
  contact,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  contact?: {
    displayName: string;
    givenName: string | null;
    familyName: string | null;
    notes: string | null;
  };
  pending: boolean;
  error: Error | null;
  onSubmit: (draft: ContactDraft) => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(contact?.displayName ?? "");
  const [givenName, setGivenName] = useState(contact?.givenName ?? "");
  const [familyName, setFamilyName] = useState(contact?.familyName ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const dirty =
    displayName !== (contact?.displayName ?? "") ||
    givenName !== (contact?.givenName ?? "") ||
    familyName !== (contact?.familyName ?? "") ||
    notes !== (contact?.notes ?? "");
  return (
    <FormSheet
      title={contact ? "Edit contact" : "New contact"}
      description={
        contact
          ? undefined
          : "Workspace members can see contacts. Add emails and phone numbers after you create it."
      }
      saveLabel={contact ? "Save" : "Create"}
      dirty={dirty}
      pending={pending}
      canSave={displayName.trim().length > 0}
      error={error}
      onClose={onClose}
      onSave={() =>
        onSubmit({
          displayName: displayName.trim(),
          givenName: givenName.trim() || null,
          familyName: familyName.trim() || null,
          notes: notes || null,
        })
      }
    >
      <TextField
        label="Display name"
        value={displayName}
        onChange={setDisplayName}
        maxLength={1000}
        autoFocus={!contact}
      />
      <TextField label="First name" value={givenName} onChange={setGivenName} maxLength={1000} />
      <TextField label="Last name" value={familyName} onChange={setFamilyName} maxLength={1000} />
      <TextField label="Notes" value={notes} onChange={setNotes} multiline maxLength={50000} />
    </FormSheet>
  );
}
