import type { useRecordPeople } from "./record-people-directory";
import { FormMessage } from "@/components/feedback/form-message";
import { PeoplePicker } from "@/components/people/people-picker";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import type { PickedRecipient } from "@/lib/people/people-picker";

export function RecordPersonField({
  id,
  directory,
  value,
  onValueChange,
  onPendingTextChange,
  disabled,
}: {
  id: string;
  directory: ReturnType<typeof useRecordPeople>;
  value: PickedRecipient[];
  onValueChange: (value: PickedRecipient[]) => void;
  onPendingTextChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Person</FieldLabel>
      <PeoplePicker
        id={id}
        people={directory.people}
        value={value}
        onValueChange={onValueChange}
        onPendingTextChange={onPendingTextChange}
        allowEmail={false}
        max={1}
        disabled={disabled || directory.pending || !!directory.error}
        placeholder="Search workspace people…"
      />
      {directory.pending && <FieldDescription>Loading workspace people…</FieldDescription>}
      {!directory.pending && !directory.error && directory.people.length === 0 && (
        <FieldDescription>No eligible workspace people are available.</FieldDescription>
      )}
      <FormMessage
        error={directory.error}
        errorDescription="Couldn’t load workspace people. Close this dialog and try again."
      />
    </Field>
  );
}
