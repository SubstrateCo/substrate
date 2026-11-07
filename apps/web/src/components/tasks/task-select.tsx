import { useId } from "react";

import { Field, FieldError, FieldLabel } from "../ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export function TaskSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
  onBlur,
  errors = [],
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: NoInfer<T>; label: string }[];
  disabled?: boolean;
  onBlur?: () => void;
  errors?: ({ message?: string } | undefined)[];
}) {
  const id = useId();
  return (
    <Field className="relative min-w-0" data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option) onChange(option.value);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="w-full min-w-0"
          onBlur={onBlur}
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length > 0 ? `${id}-error` : undefined}
        >
          <SelectValue className="min-w-0" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          className="w-(--radix-select-trigger-width) max-w-dvw"
        >
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="wrap-anywhere whitespace-normal"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id={`${id}-error`} errors={errors} />
    </Field>
  );
}
