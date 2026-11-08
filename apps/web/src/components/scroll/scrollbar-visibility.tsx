import { Debouncer } from "@tanstack/pacer/debouncer";

import { useEffect } from "react";

export function ScrollbarVisibility() {
  useEffect(() => {
    const debouncers = new Map<Element, Debouncer<() => void>>();

    function onScroll(event: Event) {
      const element = event.target === document ? document.scrollingElement : event.target;
      if (!(element instanceof Element)) return;

      element.setAttribute("data-scrolling", "");
      let debouncer = debouncers.get(element);
      if (!debouncer) {
        debouncer = new Debouncer(
          () => {
            element.removeAttribute("data-scrolling");
            debouncers.delete(element);
          },
          { wait: 700 },
        );
        debouncers.set(element, debouncer);
      }
      debouncer.maybeExecute();
    }

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      for (const [element, debouncer] of debouncers) {
        debouncer.cancel();
        element.removeAttribute("data-scrolling");
      }
    };
  }, []);

  return null;
}
