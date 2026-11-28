export type ScrollMetrics = { offset: number; viewport: number; content: number };

export type ScrollEdges = { start: boolean; end: boolean };

const tolerance = 1;

export function scrollEdges({ offset, viewport, content }: ScrollMetrics): ScrollEdges {
  if (viewport <= 0 || content <= viewport + tolerance) return { start: false, end: false };
  return {
    start: offset > tolerance,
    end: offset + viewport < content - tolerance,
  };
}
