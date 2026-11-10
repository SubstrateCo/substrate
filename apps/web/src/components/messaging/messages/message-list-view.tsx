import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { ArrowDown } from "lucide-react";

export function MessageList({
  lastId,
  header,
  footer,
  olderPage = false,
  children,
}: {
  lastId?: string;
  /** The first row inside the scrolling timeline, such as a way to load older messages. */
  header?: ReactNode;
  /** Floats over the bottom edge without taking space. */
  footer?: ReactNode;
  olderPage?: boolean;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (follow.current && container.current)
      container.current.scrollTop = container.current.scrollHeight;
  }, [lastId]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        role="log"
        aria-label="Messages"
        className="min-h-0 flex-1 overflow-y-auto pt-4 pb-3"
        onScroll={() => {
          const node = container.current;
          if (node) {
            follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
            setAway(!follow.current);
          }
        }}
      >
        {header}
        {children}
      </div>
      {(footer || away) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          {footer}
          {away && !olderPage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-auto"
              onClick={() => {
                if (container.current) container.current.scrollTop = container.current.scrollHeight;
              }}
            >
              <ArrowDown aria-hidden="true" /> Back to latest
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
