import { useState } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { SettingsCard, SettingsFooter } from "@/components/layout/settings-section";

/** A card that edits one display name and saves it with its own footer. */
export function NameSettingsCard({
  id,
  title,
  description,
  label,
  value,
  maxLength = 100,
  readOnlyNote,
  pending,
  error,
  errorDescription,
  onSave,
}: {
  id: string;
  title: string;
  description: string;
  label: string;
  value: string;
  maxLength?: number;
  /** Shown under a read-only field, instead of the Save controls, when the viewer can't edit. */
  readOnlyNote?: string;
  pending: boolean;
  error?: Error | null;
  errorDescription: string;
  /** Call `onSaved` after the new name is stored. */
  onSave: (name: string, onSaved: () => void) => void;
}) {
  // Null follows the saved value; a string is an unsaved edit.
  const [draft, setDraft] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const current = draft ?? value;
  const dirty = draft !== null && draft.trim() !== value;
  return (
    <>
      <UnsavedChangesGuard
        dirty={dirty}
        description={`Your new ${label.toLowerCase()} isn’t saved.`}
      />
      <NativeForm
        key={formVersion}
        pending={pending}
        className="min-w-0"
        onSubmit={() => {
          if (!dirty) return;
          onSave(current.trim(), () => setDraft(null));
        }}
      >
        <SettingsCard
          title={title}
          description={description}
          footer={
            !readOnlyNote && (
              <SettingsFooter
                dirty={dirty}
                pending={pending}
                error={error && actionErrorMessage(error, errorDescription)}
                onDiscard={() => {
                  setDraft(null);
                  setFormVersion((version) => version + 1);
                }}
              />
            )
          }
        >
          <NativeField
            id={id}
            name={id}
            label={label}
            value={current}
            maxLength={maxLength}
            autoComplete="off"
            required
            // A name made only of spaces is empty.
            pattern=".*\S.*"
            title={`Enter ${label.toLowerCase()}.`}
            readOnly={Boolean(readOnlyNote)}
            description={readOnlyNote}
            onChange={(event) => setDraft(event.target.value)}
          />
        </SettingsCard>
      </NativeForm>
    </>
  );
}
