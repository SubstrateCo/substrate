import { useState } from "react";

import { useFocusReturn, type FocusFallback } from "./use-focus-return";

/**
 * A dialog mounted by state, such as a confirm. It has no trigger of its own, so `open`
 * remembers the launcher (by default the focused element) and `restoreFocus` returns there, or to
 * `fallback` once the launcher is gone. Pass `restoreFocus` as the dialog's `onRestoreFocus`.
 */
export function useStateDialog<T>(fallback?: FocusFallback) {
  const [value, setValue] = useState<T>();
  const { remember, restore } = useFocusReturn(fallback);
  const open = (next: T, launcher?: Element | null) => {
    remember(launcher);
    setValue(() => next);
  };
  const close = () => setValue(undefined);
  return { value, open, close, restoreFocus: restore };
}
