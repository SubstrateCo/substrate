import { useCallback, useRef, type RefObject } from "react";

export function useFocusReturn(fallbackRef?: RefObject<HTMLElement | null>) {
  const launcher = useRef<Element | null>(document.activeElement);
  const remember = useCallback(() => {
    launcher.current = document.activeElement;
  }, []);
  const restore = useCallback(() => {
    if (
      launcher.current instanceof HTMLElement &&
      launcher.current.isConnected &&
      !launcher.current.matches(":disabled")
    )
      launcher.current.focus();
    else fallbackRef?.current?.focus();
  }, [fallbackRef]);
  return { remember, restore };
}
