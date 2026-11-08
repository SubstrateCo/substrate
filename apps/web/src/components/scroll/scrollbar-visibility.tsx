import { useEffect } from "react";

export function ScrollbarVisibility() {
  useEffect(() => {
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();

    function onScroll(event: Event) {
      const element = event.target === document ? document.scrollingElement : event.target;
      if (!(element instanceof Element)) return;

      element.setAttribute("data-scrolling", "");
      clearTimeout(timers.get(element));
      timers.set(
        element,
        setTimeout(() => {
          element.removeAttribute("data-scrolling");
          timers.delete(element);
        }, 700),
      );
    }

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      for (const [element, timeout] of timers) {
        clearTimeout(timeout);
        element.removeAttribute("data-scrolling");
      }
    };
  }, []);

  return null;
}
