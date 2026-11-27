import { pageSignals } from "../runtime/page-signals.ts";

/** An element, a ref to one, or a point in viewport pixels. */
export type LookTarget = Element | { current: Element | null } | { x: number; y: number };

export interface LookOptions {
  lookAt: LookTarget | null;
  followPointer: boolean | number;
  followFocus: boolean;
}

const DEFAULT_POINTER_RADIUS = 240;

function center(element: Element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function pointOf(target: LookTarget): { x: number; y: number } | null {
  if (target instanceof Element) return center(target);
  if ("current" in target) return target.current ? center(target.current) : null;
  return target;
}

/** Focus on another element wins over the pointer until the pointer moves again. */
function focusWins(svg: SVGSVGElement, focus: Element): boolean {
  const signals = pageSignals();
  return focus.isConnected && !svg.contains(focus) && signals.focusAt > signals.pointerAt;
}

function targetPoint(svg: SVGSVGElement, rect: DOMRect, options: LookOptions) {
  if (options.lookAt) return pointOf(options.lookAt);
  const signals = pageSignals();
  const focus = signals.focus;
  if (options.followFocus && focus && focusWins(svg, focus)) {
    return center(focus);
  }
  if (options.followPointer === false || !signals.pointer) return null;
  const radius = options.followPointer === true ? DEFAULT_POINTER_RADIUS : options.followPointer;
  const dx = signals.pointer.x - (rect.left + rect.width / 2);
  const dy = signals.pointer.y - (rect.top + rect.height / 2);
  return Math.hypot(dx, dy) <= radius + rect.width / 2 ? signals.pointer : null;
}

/** Direction from the avatar to whatever it should look at, from -1 to 1 on each axis. */
export function readLook(
  svg: SVGSVGElement,
  options: LookOptions,
): { x: number; y: number } | null {
  if (!options.lookAt && !options.followFocus && options.followPointer === false) return null;
  const rect = svg.getBoundingClientRect();
  const target = targetPoint(svg, rect, options);
  if (!target) return null;
  const reach = Math.max(rect.width * 2.5, 160);
  return {
    x: Math.tanh((target.x - (rect.left + rect.width / 2)) / reach),
    y: Math.tanh((target.y - (rect.top + rect.height * 0.45)) / reach),
  };
}
