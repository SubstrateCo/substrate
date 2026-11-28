export const enterMotion = {
  fade: "transition-opacity duration-150 ease-out starting:opacity-0",
  rise: "transition duration-200 ease-out starting:translate-y-1 starting:opacity-0",
};

let curve: string | undefined;

/** The `--ease-out` token, for the Web Animations API, which cannot read `var()`. */
export function easeOut() {
  curve ??=
    getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() || "ease-out";
  return curve;
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
