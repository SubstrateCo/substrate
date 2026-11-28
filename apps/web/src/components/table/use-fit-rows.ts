import { useEffectEvent, useLayoutEffect, type RefObject } from "react";

const settleMs = 150;

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
      if (!body || !frame || !row) return;
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
