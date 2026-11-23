import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { ArrowDown } from "lucide-react";

export function MessageList({
  lastId,
  header,
  footer,
  olderPage = false,
  positionReady = true,
  onLatestVisibleChange,
  children,
}: {
  lastId?: string;
  /** The first row inside the scrolling timeline, such as a way to load older messages. */
  header?: ReactNode;
  /** Floats over the bottom edge without taking space. */
  footer?: ReactNode;
  olderPage?: boolean;
  /**
   * The first scroll waits for this. It opens at the "New" divider when there is one, otherwise at
   * the newest message.
   */
  positionReady?: boolean;
  /** Reports whether the newest message is in view. */
  onLatestVisibleChange?: (visible: boolean) => void;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const positioned = useRef(false);
  const [away, setAway] = useState(false);
  const measure = () => {
    const node = container.current;
    if (!node) return;
    follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
    setAway(!follow.current);
    onLatestVisibleChange?.(follow.current);
  };
  useLayoutEffect(() => {
    const node = container.current;
    if (!node || !positionReady) return;
    if (!positioned.current) {
      positioned.current = true;
      const divider = node.querySelector<HTMLElement>("[data-unread-divider]");
      node.scrollTop = divider
        ? node.scrollTop + divider.getBoundingClientRect().top - node.getBoundingClientRect().top
        : node.scrollHeight;
    } else if (follow.current) node.scrollTop = node.scrollHeight;
    // Setting the same scroll position fires no scroll event, so measure here too.
    measure();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Position again only when the newest message changes or the first position becomes known.
  }, [lastId, positionReady]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        role="log"
        aria-label="Messages"
        className="min-h-0 flex-1 overflow-y-auto pt-4 pb-3"
        onScroll={measure}
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
