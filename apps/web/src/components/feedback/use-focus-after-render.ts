import { useCallback, useEffect, useReducer, useRef } from "react";

type FocusTarget = () => HTMLElement | null | undefined;

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
