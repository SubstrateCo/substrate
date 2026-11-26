import { useRef, type RefObject } from "react";

/** Where focus goes when the launcher is gone: an element, or a function that moves it. */
export type FocusFallback = RefObject<HTMLElement | null> | (() => void);

/**
 * A menu or select item is gone once its list closes, so focus returns to the trigger that
 * controls the list.
 */
function launcherOf(element: Element | null) {
  const list = element?.closest('[role="menu"], [role="listbox"]');
  if (!list?.id) return element;
  return document.querySelector(`[aria-controls="${CSS.escape(list.id)}"]`) ?? element;
}

export function useFocusReturn(fallback?: FocusFallback) {
  const launcher = useRef<Element | null>(document.activeElement);
  /** Keeps `element`, by default the focused element, as the place to return to. */
  const remember = (element: Element | null = document.activeElement) => {
    launcher.current = launcherOf(element);
  };
  const restore = () => {
    const element = launcher.current;
    if (element instanceof HTMLElement && element.isConnected && !element.matches(":disabled"))
      element.focus();
    else if (fallback instanceof Function) fallback();
    else fallback?.current?.focus();
  };
  return { remember, restore };
}
