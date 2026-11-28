import { useLayoutEffect, useRef } from "react";

import { easeOut, ghostOf, reducedMotion } from "./motion";

const exits = {
  fade: { keyframes: [{ opacity: 1 }, { opacity: 0 }], duration: 150 },
  drop: {
    keyframes: [
      { opacity: 1, translate: "0 0" },
      { opacity: 0, translate: "0 4px" },
    ],
    duration: 200,
  },
};

const MOVE_MS = 200;

type Anchor = "top" | "bottom";
type Place = { node: HTMLElement; top: number; bottom: number; left: number; width: number };

/** Layout offsets ignore transforms, so a row that is still moving reports where it will rest. */
function measure(container: HTMLElement) {
  const places = new Map<string, Place>();
  for (const node of container.querySelectorAll<HTMLElement>("[data-motion-key]")) {
    const key = node.dataset.motionKey;
    if (!key) continue;
    places.set(key, {
      node,
      top: node.offsetTop,
      bottom: container.clientHeight - node.offsetTop - node.offsetHeight,
      left: node.offsetLeft,
      width: node.offsetWidth,
    });
  }
  return places;
}

export function useListMotion<T extends HTMLElement>(anchor: Anchor, exit: keyof typeof exits) {
  const container = useRef<T>(null);
  const last = useRef(new Map<string, Place>());
  useLayoutEffect(() => {
    const list = container.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      last.current = measure(list);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const list = container.current;
    if (!list) return;
    const previous = last.current;
    const current = measure(list);
    last.current = current;
    const gone = [...previous].filter(([key]) => !current.has(key));
    if (!gone.length || reducedMotion()) return;
    const easing = easeOut();
    for (const [, place] of gone) {
      const ghost = ghostOf(place.node);
      if (!ghost) continue;
      ghost.style.margin = "0";
      ghost.style.left = `${place.left}px`;
      ghost.style.width = `${place.width}px`;
      ghost.style[anchor] = `${place[anchor]}px`;
      list.append(ghost);
      const { keyframes, duration } = exits[exit];
      const remove = () => ghost.remove();
      void ghost
        .animate(keyframes, { duration, easing, fill: "forwards" })
        .finished.then(remove, remove);
    }
    for (const [key, place] of current) {
      const before = previous.get(key);
      if (!before) continue;
      const shift = anchor === "top" ? before.top - place.top : place.bottom - before.bottom;
      if (shift)
        place.node.animate([{ translate: `0 ${shift}px` }, { translate: "0 0" }], {
          duration: MOVE_MS,
          easing,
        });
    }
  });
  return container;
}
