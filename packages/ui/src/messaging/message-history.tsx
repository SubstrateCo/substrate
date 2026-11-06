import type { ReactNode } from "react";
import { Button } from "../primitives/button";

export function MessageHistory({
  replies = false,
  hasOlder,
  hasPrevious,
  onOlder,
  onLatest,
  children,
}: {
  replies?: boolean;
  hasOlder: boolean;
  hasPrevious: boolean;
  onOlder: () => void;
  onLatest: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex gap-2 px-4">
        {hasOlder && (
          <Button size="xs" variant="ghost" onClick={onOlder}>
            {replies ? "Older replies" : "Older messages"}
          </Button>
        )}
        {hasPrevious && (
          <Button size="xs" variant="ghost" onClick={onLatest}>
            {replies ? "Latest replies" : "Back to latest"}
          </Button>
        )}
      </div>
      {children}
    </>
  );
}
