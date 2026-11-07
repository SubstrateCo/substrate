import { useState, type SyntheticEvent, type InputEvent } from "react";

export function useNativeValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onInvalid(event: SyntheticEvent<HTMLFormElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    event.preventDefault();
    setErrors((previous) => ({ ...previous, [input.id]: input.validationMessage }));
    event.currentTarget.querySelector<HTMLElement>("input:invalid, textarea:invalid")?.focus();
  }

  function onInput(event: InputEvent<HTMLFormElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    setErrors((previous) =>
      previous[input.id] ? { ...previous, [input.id]: input.validationMessage } : previous,
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
