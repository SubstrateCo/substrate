/**
 * Motion that CSS alone cannot run: exits after React removes a node, and layout moves. Each
 * animation uses the `--ease-out` token from `components/styles.css`.
 */

/** Entrances for nodes that mount while the person watches. CSS runs them with `@starting-style`. */
export const enterMotion = {
  /** For content the person reads, such as a reply: nothing moves. */
  fade: "transition-opacity duration-150 ease-out starting:opacity-0",
  /** For floating status, such as the composer notice: rises 4px from the edge it sits on. */
  rise: "transition duration-200 ease-out starting:translate-y-1 starting:opacity-0",
};

let curve: string | undefined;

/** The `--ease-out` token, for the Web Animations API, which cannot read `var()`. */
export function easeOut() {
  curve ??=
    getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() || "ease-out";
  return curve;
}

/** The stylesheet shortens CSS motion for this setting; script motion checks it here. */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A still copy of a node React removed, for its exit animation. It is inert, hidden from
 * assistive technology, and absolutely positioned; the caller places it and removes it.
 */
export function ghostOf(node: Element) {
  const ghost = node.cloneNode(true);
  if (!(ghost instanceof HTMLElement)) return null;
  ghost.removeAttribute("data-motion-key");
  ghost.inert = true;
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.position = "absolute";
  ghost.style.pointerEvents = "none";
  return ghost;
}
