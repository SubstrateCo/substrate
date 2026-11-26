/** A horizontal scroll row's position: how far it has scrolled, its visible width, and its content width. */
export type ScrollMetrics = { offset: number; viewport: number; content: number };

/** Which sides of a scroll row hide content. */
export type ScrollEdges = { start: boolean; end: boolean };

/** Ignores sub-pixel rounding, so a row scrolled to its end shows no end fade. */
const tolerance = 1;

/**
 * Reports content hidden before the start or past the end of a scroll row. A row that is not yet
 * measured, or whose content fits, hides nothing.
 */
export function scrollEdges({ offset, viewport, content }: ScrollMetrics): ScrollEdges {
  if (viewport <= 0 || content <= viewport + tolerance) return { start: false, end: false };
  return {
    start: offset > tolerance,
    end: offset + viewport < content - tolerance,
  };
}
