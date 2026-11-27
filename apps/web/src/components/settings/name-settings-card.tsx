import { useState } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { SettingsDetail, SettingsFooter } from "@/components/layout/settings-section";

/** A display-name detail with its own draft and save controls. */
export function NameSettingsCard({
  id,
  title,
  description,
  label,
  missingMessage,
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
  /** Shown when the name is empty or only spaces, such as "Enter your name." */
  missingMessage: string;
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
        name={label}
      />
      <SettingsDetail title={title} description={description}>
        <NativeForm
          key={formVersion}
          pending={pending}
          className="max-w-xl min-w-0 space-y-4"
          onSubmit={() => {
            if (!dirty) return;
            onSave(current.trim(), () => setDraft(null));
          }}
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
            title={missingMessage}
            missingMessage={missingMessage}
            readOnly={Boolean(readOnlyNote)}
            description={readOnlyNote}
            onChange={(event) => setDraft(event.target.value)}
          />
          {!readOnlyNote && (dirty || pending || error) && (
            <SettingsFooter
              dirty={dirty}
              pending={pending}
              error={error && actionErrorMessage(error, errorDescription)}
              onDiscard={() => {
                setDraft(null);
                setFormVersion((version) => version + 1);
              }}
            />
          )}
        </NativeForm>
      </SettingsDetail>
    </>
  );
}
