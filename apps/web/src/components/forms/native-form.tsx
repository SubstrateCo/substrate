import { createContext, useContext, type ComponentProps, type ReactNode } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { useNativeValidation } from "./use-native-validation";

const NativeValidation = createContext<ReturnType<typeof useNativeValidation> | null>(null);

/** A form that shows constraint failures inline in product copy and submits its FormData once. */
export function NativeForm({
  pending,
  onSubmit,
  className = "space-y-4",
  children,
}: {
  pending: boolean;
  onSubmit: (form: FormData) => void;
  className?: string;
  children: ReactNode;
}) {
  const validation = useNativeValidation();
  return (
    <NativeValidation.Provider value={validation}>
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
    </NativeValidation.Provider>
  );
}

/**
 * A labelled input inside NativeForm. Its error and description ids derive from `id`. An empty
 * required field shows "Enter <label>." unless `missingMessage` gives better copy.
 */
export function NativeField({
  id,
  label,
  description,
  missingMessage,
  labelAction,
  ...props
}: ComponentProps<typeof Input> & {
  id: string;
  label: string;
  description?: ReactNode;
  missingMessage?: string;
  /** A small link on the label row, such as "Forgot password?". */
  labelAction?: ReactNode;
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
  const input = (
    <Input
      {...props}
      id={id}
      data-missing-message={missingMessage}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy || undefined}
    />
  );
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
    />
  );
}
