import { useEffectEvent, useLayoutEffect, type RefObject } from "react";

const settleMs = 150;

/**
 * Reports how many body rows fit in the results area without scrolling. It measures at once, then
 * again after each resize settles, so dragging a window edge does not load a page per frame.
 */
export function useFitRows(
  results: RefObject<HTMLElement | null>,
  onFit: ((rows: number) => void) | undefined,
) {
  const report = useEffectEvent((rows: number) => onFit?.(rows));
  const enabled = !!onFit;
  useLayoutEffect(() => {
    const element = results.current;
    if (!element || !enabled) return;
    const measure = () => {
      const body = element.querySelector("tbody");
      const frame = body?.closest("[data-slot=table-container]")?.parentElement;
      const row = body?.querySelector("tr")?.getBoundingClientRect().height;
      // Nothing to measure while a notice replaces the table or mobile cards hide it.
      if (!body || !frame || !row) return;
      // The header, frame border, and any horizontal scrollbar take space from the rows.
      const chrome = frame.getBoundingClientRect().height - body.getBoundingClientRect().height;
      report(Math.max(1, Math.floor((element.clientHeight - chrome) / row)));
    };
    measure();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, settleMs);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [results, enabled]);
}
