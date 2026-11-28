import { useCallback, useState } from "react";

export type TurnVisibilityChange = (turnId: string, element: Element, visible: boolean) => void;

export function useVisibleTurnStatuses() {
  const [visible, setVisible] = useState<ReadonlyMap<string, ReadonlySet<Element>>>(
    new Map<string, ReadonlySet<Element>>(),
  );
  const onVisibilityChange: TurnVisibilityChange = useCallback((turnId, element, inView) => {
    setVisible((previous) => {
      const elements = previous.get(turnId) ?? new Set<Element>();
      if (previous.has(turnId) && elements.has(element) === inView) return previous;
      const nextElements = new Set(elements);
      if (inView) nextElements.add(element);
      else nextElements.delete(element);
      const next = new Map(previous);
      next.set(turnId, nextElements);
      return next;
    });
  }, []);
  const offscreen = new Set(
    [...visible].flatMap(([turnId, elements]) => (elements.size === 0 ? [turnId] : [])),
  );
  return { offscreen, onVisibilityChange };
}
