import { useState, type SyntheticEvent, type InputEvent } from "react";

import { nativeValidationMessage } from "@/lib/forms/validation-messages";

type Control = HTMLInputElement | HTMLTextAreaElement;

/** Product copy for the control's current constraint failure, or "" when it is valid. */
function messageFor(control: Control) {
  if (control.validity.valid) return "";
  return nativeValidationMessage({
    validity: control.validity,
    type: control.type,
    multiple: control instanceof HTMLInputElement && control.multiple,
    minLength: control.minLength > 0 ? control.minLength : undefined,
    maxLength: control.maxLength > 0 ? control.maxLength : undefined,
    min: control instanceof HTMLInputElement ? control.min || undefined : undefined,
    max: control instanceof HTMLInputElement ? control.max || undefined : undefined,
    label: control.labels?.[0]?.textContent ?? control.getAttribute("aria-label") ?? undefined,
    title: control.title || undefined,
    missingMessage: control.dataset.missingMessage,
  });
}

/**
 * Shows constraint failures inline with field-specific copy instead of browser bubbles. Give a
 * required control `data-missing-message` when "Enter <label>." does not read well.
 */
export function useNativeValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onInvalid(event: SyntheticEvent<HTMLFormElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    event.preventDefault();
    setErrors((previous) => ({ ...previous, [input.id]: messageFor(input) }));
    event.currentTarget.querySelector<HTMLElement>("input:invalid, textarea:invalid")?.focus();
  }

  function onInput(event: InputEvent<HTMLFormElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    setErrors((previous) =>
      previous[input.id] ? { ...previous, [input.id]: messageFor(input) } : previous,
    );
  }

  function inputProps(id: string) {
    return {
      "aria-invalid": errors[id] ? true : undefined,
      "aria-describedby": errors[id] ? `${id}-error` : undefined,
    } as const;
  }

  return { errors, onInvalid, onInput, inputProps };
}
