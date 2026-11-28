import type { useRecordPeople } from "./record-people-directory";
import { FormMessage } from "@/components/feedback/form-message";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { PersonField } from "@/components/people/person-field";

export function RecordPersonField({
  directory,
  value,
  onValueChange,
  disabled,
}: {
  directory: ReturnType<typeof useRecordPeople>;
  value: string;
  onValueChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <PersonField
      people={directory.people}
      value={value}
      onChange={onValueChange}
      empty="No eligible workspace people are available."
      disabled={disabled || directory.pending || !!directory.error}
    >
      {directory.pending && (
        <span role="status" aria-label="Loading workspace people">
          <SkeletonText width="12rem" />
        </span>
      )}
      <FormMessage
        error={directory.error}
        errorDescription="Couldn’t load workspace people. Close this dialog and try again."
      />
    </PersonField>
  );
}
