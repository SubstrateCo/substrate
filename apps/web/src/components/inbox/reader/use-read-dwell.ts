import { useEffect, useEffectEvent } from "react";

export function useReadDwell(element: HTMLElement | null, enabled: boolean, onRead: () => void) {
  const read = useEffectEvent(onRead);
  useEffect(() => {
    if (!enabled || !element) return;
    let visible = false;
    let timer: number | undefined;
    const foreground = () =>
      visible &&
      document.visibilityState === "visible" &&
      document.hasFocus() &&
      !document.activeElement?.closest('[role="dialog"], [role="alertdialog"]');
    function cancel() {
      window.clearTimeout(timer);
      timer = undefined;
    }
    function update() {
      if (!foreground()) return cancel();
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        if (foreground()) read();
      }, 2000);
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    document.addEventListener("focusin", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      document.removeEventListener("focusin", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", cancel);
    };
  }, [element, enabled]);
}
