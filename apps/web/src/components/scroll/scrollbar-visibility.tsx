import { useEffect } from "react";

function scheduleScrollbarHide(element: Element, onHide: () => void) {
  const timeout = setTimeout(() => {
    element.removeAttribute("data-scrolling");
    onHide();
  }, 700);
  return () => clearTimeout(timeout);
}

export function ScrollbarVisibility() {
  useEffect(() => {
    const pendingHides = new Map<Element, () => void>();

    function onScroll(event: Event) {
      const element = event.target === document ? document.scrollingElement : event.target;
      if (!(element instanceof Element)) return;

      element.setAttribute("data-scrolling", "");
      pendingHides.get(element)?.();
      pendingHides.set(
        element,
        scheduleScrollbarHide(element, () => pendingHides.delete(element)),
      );
    }

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      for (const [element, cancelHide] of pendingHides) {
        cancelHide();
        element.removeAttribute("data-scrolling");
      }
      pendingHides.clear();
    };
  }, []);

  return null;
}
