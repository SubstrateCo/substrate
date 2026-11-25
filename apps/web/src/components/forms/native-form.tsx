import {
  createContext,
  useContext,
  type ChangeEventHandler,
  type ComponentProps,
  type ReactNode,
} from "react";

import { useNativeValidation } from "./use-native-validation";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const NativeValidation = createContext<ReturnType<typeof useNativeValidation> | null>(null);

/** Gives NativeField the validation state of a form that is not NativeForm, such as FormDialog. */
export function NativeValidationScope({
  validation,
  children,
}: {
  validation: ReturnType<typeof useNativeValidation>;
  children: ReactNode;
}) {
  return <NativeValidation.Provider value={validation}>{children}</NativeValidation.Provider>;
}

/** A form that shows constraint failures inline in product copy and submits its FormData once. */
export function NativeForm({
  pending,
  onSubmit,
  // Gap, not space-y: a form inside a dialog is display: contents, and margins would still apply.
  className = "flex flex-col gap-4",
  children,
}: {
  pending: boolean;
  onSubmit: (form: FormData) => void;
  className?: string;
  children: ReactNode;
}) {
  const validation = useNativeValidation();
  return (
    <NativeValidationScope validation={validation}>
      <form
        className={className}
        onInvalidCapture={validation.onInvalid}
        onInput={validation.onInput}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        {children}
      </form>
    </NativeValidationScope>
  );
}

type ControlProps = Omit<
  ComponentProps<typeof Input> & ComponentProps<typeof Textarea>,
  "id" | "onChange" | "aria-invalid" | "aria-describedby" | "required"
>;

type MissingValue =
  | { required: true; missingMessage: string }
  | { required?: false; missingMessage?: undefined };

/**
 * A labelled input, or a textarea with `multiline`, inside NativeForm or a FormDialog with
 * `nativeValidation`. Its error and description ids derive from `id`. A required field names
 * what is missing in `missingMessage` ("Enter a contact name.").
 */
export function NativeField({
  id,
  label,
  description,
  missingMessage,
  required,
  labelAction,
  multiline = false,
  onChange,
  ...props
}: ControlProps &
  MissingValue & {
    id: string;
    label: string;
    description?: ReactNode;
    /** A small link on the label row, such as "Forgot password?". */
    labelAction?: ReactNode;
    multiline?: boolean;
    onChange?: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  }) {
  const validation = useContext(NativeValidation);
  if (!validation) throw new Error("NativeField must be inside NativeForm.");
  const error = validation.errors[id];
  // The error replaces the hint so the two never stack.
  const hint = error ? undefined : description;
  const describedBy = [hint && `${id}-description`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  const fieldLabel = <FieldLabel htmlFor={id}>{label}</FieldLabel>;
  const control = {
    ...props,
    id,
    required,
    onChange,
    "data-missing-message": missingMessage,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };
  const input = multiline ? <Textarea {...control} /> : <Input {...control} />;
  return (
    <Field data-invalid={Boolean(error)}>
      {labelAction ? (
        // The action shares the label row but follows the input in the DOM, so Tab goes from the
        // previous field to this input first and to the action after it.
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="order-1 grow">{fieldLabel}</div>
          <div className="order-3 w-full">{input}</div>
          <div className="order-2">{labelAction}</div>
        </div>
      ) : (
        <>
          {fieldLabel}
          {input}
        </>
      )}
      {hint && <FieldDescription id={`${id}-description`}>{hint}</FieldDescription>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}

export function EmailField({
  defaultValue,
  autoFocus,
}: {
  defaultValue?: string;
  /** For a page whose first task is this field, such as sign-in. */
  autoFocus?: boolean;
}) {
  return (
    <NativeField
      id="email"
      name="email"
      label="Email"
      type="email"
      autoComplete="email"
      defaultValue={defaultValue}
      autoFocus={autoFocus}
      required
      missingMessage="Enter your email address."
    />
  );
}
