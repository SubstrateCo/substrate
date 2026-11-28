import { useState } from "react";

import { useFocusReturn, type FocusFallback } from "./use-focus-return";

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
