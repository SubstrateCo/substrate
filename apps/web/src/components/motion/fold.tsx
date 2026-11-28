import { useLayoutEffect, useRef, type ReactNode } from "react";

import { easeOut, ghostOf, reducedMotion } from "./motion";

const HEIGHT_MS = 260;
const OUT_MS = 140;
const IN_MS = 200;
const IN_DELAY_MS = 80;

type Shown = { state: string; content: Element | null; height: number };

/**
 * Folds the old content into the new: the height moves from one to the other while the old
 * content fades out over the new, which settles in. Returns a function that ends the fold now.
 */
function fold(wrapper: HTMLElement, old: Element, from: number, done: () => void) {
  const ghost = ghostOf(old);
  if (!ghost) return null;
  const easing = easeOut();
  const to = wrapper.offsetHeight;
  const content = wrapper.firstElementChild;
  ghost.style.top = "0";
  ghost.style.left = "0";
  ghost.style.right = "0";
  wrapper.append(ghost);
  wrapper.style.overflow = "hidden";
  const height = wrapper.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: HEIGHT_MS,
    easing,
  });
  const animations = [
    height,
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing, fill: "forwards" }),
  ];
  if (content)
    animations.push(
      content.animate(
        [
          { opacity: 0, translate: "0 -2px" },
          { opacity: 1, translate: "0 0" },
        ],
        { duration: IN_MS, delay: IN_DELAY_MS, easing, fill: "backwards" },
      ),
    );
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    for (const animation of animations) animation.cancel();
    ghost.remove();
    wrapper.style.removeProperty("overflow");
    done();
  };
  // Ending early cancels the animation, which rejects `finished`; `end` has already run then.
  void height.finished.then(end, () => {});
  return end;
}

/**
 * Swaps its content and, when `state` changes, folds the old content into the new one, such as
 * an answered request becoming its one-line result. The first render and updates within one
 * state do not move.
 */
export function Fold({ state, children }: { state: string; children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const shown = useRef<Shown | null>(null);
  const folding = useRef<(() => void) | null>(null);
  // The content can change height without this component rendering, such as a step change.
  useLayoutEffect(() => {
    const node = wrapper.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (shown.current && !folding.current)
        shown.current = { ...shown.current, height: node.offsetHeight };
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      folding.current?.();
    };
  }, []);
  useLayoutEffect(() => {
    const node = wrapper.current;
    if (!node) return;
    const previous = shown.current;
    const changed = !!previous && previous.state !== state;
    // A new state ends the running fold, so the heights below are the real ones.
    if (changed) folding.current?.();
    const content = node.firstElementChild;
    const height = folding.current && previous ? previous.height : node.offsetHeight;
    shown.current = { state, content, height };
    const before = changed ? previous : null;
    if (!before?.content || before.content === content || reducedMotion()) return;
    folding.current = fold(node, before.content, before.height, () => {
      folding.current = null;
      if (shown.current) shown.current = { ...shown.current, height: node.offsetHeight };
    });
  });
  return (
    <div ref={wrapper} className="relative flow-root">
      {children}
    </div>
  );
}
