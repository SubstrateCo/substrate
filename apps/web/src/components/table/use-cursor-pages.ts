import { useState } from "react";

/**
 * Pages of a cursor API as page indexes. Page 0 has no cursor; each later page keeps the cursor
 * that loaded it, so "Previous page" goes back without a total count.
 */
export function useCursorPages<TCursor>() {
  const [cursors, setCursors] = useState<TCursor[]>([]);
  return {
    cursor: cursors.at(-1),
    pageIndex: cursors.length,
    next: (cursor: TCursor) => setCursors((previous) => [...previous, cursor]),
    previous: () => setCursors((previous) => previous.slice(0, -1)),
    reset: () => setCursors([]),
  };
}
