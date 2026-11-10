import { createContext, useContext, type ComponentProps, type ReactNode } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { useNativeValidation } from "./use-native-validation";

const NativeValidation = createContext<ReturnType<typeof useNativeValidation> | null>(null);

/** A form that shows the browser's validation messages inline and submits its FormData once. */
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
        onInputCapture={validation.onInput}
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

/** A labelled input inside NativeForm. Its error and description ids derive from `id`. */
export function NativeField({
  id,
  label,
  description,
  ...props
}: ComponentProps<typeof Input> & { id: string; label: string; description?: ReactNode }) {
  const validation = useContext(NativeValidation);
  if (!validation) throw new Error("NativeField must be inside NativeForm.");
  const error = validation.errors[id];
  const describedBy = [description && `${id}-description`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}

export function EmailField({ defaultValue }: { defaultValue?: string }) {
  return (
    <NativeField
      id="email"
      name="email"
      label="Email"
      type="email"
      autoComplete="email"
      defaultValue={defaultValue}
      required
    />
  );
}
