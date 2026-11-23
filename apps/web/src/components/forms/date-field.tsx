import { useId, type ReactNode } from "react";

import { Button } from "../ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { TaskDueDatePicker } from "@/components/tasks/detail/task-due-date-picker";
import { formatShortDate, parseDateOnly } from "@/lib/format/date";
import { ChevronDown } from "lucide-react";

/**
 * A labelled date-only field: a field button that opens the due-date picker. `value` is
 * `YYYY-MM-DD` or `""`. With `name`, a hidden input carries the value in the form's FormData.
 * The error replaces the description, so the two never stack.
 */
export function DateField({
  label,
  name,
  value,
  onChange,
  description,
  errors = [],
  onBlur,
}: {
  label: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  description?: ReactNode;
  errors?: ({ message?: string } | undefined)[];
  onBlur?: () => void;
}) {
  const id = useId();
  const invalid = errors.length > 0;
  const hint = invalid ? undefined : description;
  let describedBy: string | undefined;
  if (invalid) describedBy = `${id}-error`;
  else if (hint) describedBy = `${id}-description`;
  return (
    <Field className="min-w-0" data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <TaskDueDatePicker
        value={value || null}
        onChange={(next) => {
          onChange(next ?? "");
          onBlur?.();
        }}
      >
        <Button
          id={id}
          type="button"
          variant="field"
          onBlur={onBlur}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        >
          <span>{value ? formatShortDate(parseDateOnly(value) ?? value) : "Choose a date"}</span>
          <ChevronDown
            aria-hidden="true"
            data-icon="inline-end"
            className="text-muted-foreground"
          />
        </Button>
      </TaskDueDatePicker>
      {name && <input type="hidden" name={name} value={value} />}
      {invalid && <FieldError id={`${id}-error`} errors={errors} />}
      {hint && <FieldDescription id={`${id}-description`}>{hint}</FieldDescription>}
    </Field>
  );
}
