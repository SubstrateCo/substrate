import type { InteractionTimeline } from "@substrate/contracts/context/interactions";

import { Button } from "@/components/ui/button";

type Cursor = Pick<InteractionTimeline, "beforeOccurredAt" | "beforeEntityId">;

export function InteractionPager({
  cursor,
  nextCursor,
  onCursorChange,
  className = "",
}: {
  cursor: Cursor;
  nextCursor?: Cursor | null;
  onCursorChange: (cursor: Cursor) => void;
  className?: string;
}) {
  if (!cursor.beforeEntityId && !nextCursor) return null;
  return (
    <div className={`flex shrink-0 justify-between gap-3 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        disabled={!cursor.beforeEntityId}
        onClick={() => onCursorChange({})}
      >
        Newest
      </Button>
      {nextCursor && (
        <Button variant="outline" size="sm" onClick={() => onCursorChange(nextCursor)}>
          Older interactions
        </Button>
      )}
    </div>
  );
}
