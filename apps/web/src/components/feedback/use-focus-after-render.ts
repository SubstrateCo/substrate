import { useCallback, useEffect, useReducer, useRef } from "react";

type FocusTarget = () => HTMLElement | null | undefined;

/**
 * Focuses an element that a coming render shows or enables, such as a field that a state change
 * mounts. `focusAfterRender(target)` keeps `target` and, after each commit, focuses what it
 * returns, until that element takes focus. A later call replaces an earlier one.
 */
export function useFocusAfterRender() {
  const pending = useRef<FocusTarget | null>(null);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    const element = pending.current?.();
    if (!element) return;
    element.focus();
    if (document.activeElement === element) pending.current = null;
  });
  return useCallback((target: FocusTarget) => {
    pending.current = target;
    rerender();
  }, []);
}
