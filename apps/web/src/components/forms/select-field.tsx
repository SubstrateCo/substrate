import { useId, type ReactNode } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";

// Radix items cannot use "" as a value, so an empty choice ("None", "Not set") uses this one.
const empty = "__empty__";

type Option<T extends string> = { value: T; label: string; icon?: ReactNode };

/**
 * A labelled select. An option whose value is `""` is the empty choice, such as "None". The error
 * replaces the description, so the two never stack.
 */
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder,
  description,
  errors = [],
  disabled,
  onBlur,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Option<NoInfer<T>>[];
  placeholder?: string;
  description?: ReactNode;
  errors?: ({ message?: string } | undefined)[];
  disabled?: boolean;
  onBlur?: () => void;
  className?: string;
}) {
  const id = useId();
  const invalid = errors.length > 0;
  const hint = invalid ? undefined : description;
  let describedBy: string | undefined;
  if (invalid) describedBy = `${id}-error`;
  else if (hint) describedBy = `${id}-description`;
  const known = options.some((option) => option.value === value);
  return (
    <Field className={className ?? "min-w-0"} data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        // An unknown value, such as no choice yet, shows the placeholder.
        value={known ? value || empty : ""}
        disabled={disabled}
        onValueChange={(next) => {
          const option = options.find((candidate) => (candidate.value || empty) === next);
          if (option) onChange(option.value);
        }}
      >
        <SelectTrigger
          id={id}
          className="w-full min-w-0"
          onBlur={onBlur}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        >
          <SelectValue className="min-w-0" placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          className="w-(--radix-select-trigger-width) max-w-dvw"
        >
          {options.map((option) => (
            <SelectItem
              key={option.value || empty}
              value={option.value || empty}
              className="wrap-anywhere whitespace-normal"
            >
              {option.icon}
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {invalid && <FieldError id={`${id}-error`} errors={errors} />}
      {hint && <FieldDescription id={`${id}-description`}>{hint}</FieldDescription>}
    </Field>
  );
}

/** The label and a field-height placeholder while the options load. */
export function SelectFieldLoading({ label }: { label: string }) {
  return (
    <Field aria-hidden>
      <FieldLabel>{label}</FieldLabel>
      <Skeleton className="h-8 w-full" />
    </Field>
  );
}
