import type { ComponentProps, ReactNode } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

/** The parts of a TanStack Form string field that a text input needs. */
type TextFieldApi = {
  state: {
    value: string;
    meta: { isValid: boolean; errors: Array<{ message?: string } | undefined> };
  };
  handleBlur: () => void;
  handleChange: (value: string) => void;
  validate: (cause: "blur") => void;
};

type ControlProps = Omit<
  ComponentProps<typeof Input> & ComponentProps<typeof Textarea>,
  "id" | "value" | "onChange" | "onBlur" | "aria-invalid" | "aria-describedby"
>;

/**
 * A labelled text input or textarea bound to a TanStack Form field. After a field shows an
 * error, each change validates it again so the error clears as soon as the value is valid.
 */
export function FormTextField({
  field,
  id,
  label,
  description,
  multiline = false,
  fieldClassName,
  ...props
}: ControlProps & {
  field: TextFieldApi;
  id: string;
  label: ReactNode;
  description?: ReactNode;
  multiline?: boolean;
  fieldClassName?: string;
}) {
  const invalid = !field.state.meta.isValid;
  // The error replaces the description so the two never stack.
  const hint = invalid ? undefined : description;
  const describedBy = [hint && `${id}-description`, invalid && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  const control = {
    ...props,
    id,
    value: field.state.value,
    onBlur: field.handleBlur,
    "aria-invalid": invalid,
    "aria-describedby": describedBy || undefined,
  };
  const onChange = (value: string) => {
    field.handleChange(value);
    if (!field.state.meta.isValid) field.validate("blur");
  };
  return (
    <Field data-invalid={invalid} className={fieldClassName}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea {...control} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input {...control} onChange={(event) => onChange(event.target.value)} />
      )}
      {invalid && <FieldError id={`${id}-error`} errors={field.state.meta.errors} />}
      {hint && <FieldDescription id={`${id}-description`}>{hint}</FieldDescription>}
    </Field>
  );
}
