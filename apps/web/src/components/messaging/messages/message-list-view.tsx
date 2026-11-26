import { useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown } from "lucide-react";

export function MessageList({
  lastId,
  header,
  footer,
  olderPage = false,
  sending = false,
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
  /** The person is sending a message here. */
  sending?: boolean;
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
  const content = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const measuredSize = useRef({ scrollHeight: 0, clientHeight: 0 });
  const positioned = useRef(false);
  const [away, setAway] = useState(false);
  // A newer message arrived while the person was scrolled up.
  const [unseen, setUnseen] = useState(false);
  const showedOlderPage = useRef(olderPage);
  const measure = () => {
    const node = container.current;
    if (!node) return;
    measuredSize.current = { scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
    follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
    setAway(!follow.current);
    if (follow.current) setUnseen(false);
    onLatestVisibleChange?.(follow.current);
  };
  const scrollToLatest = () => {
    if (container.current) container.current.scrollTop = container.current.scrollHeight;
  };
  const onScroll = () => {
    const node = container.current;
    if (!node) return;
    const previous = measuredSize.current;
    // Browser scroll anchoring can emit a scroll before ResizeObserver sees the new layout.
    // Do not mistake that layout change for the reader leaving the bottom.
    if (
      follow.current &&
      (previous.scrollHeight !== node.scrollHeight || previous.clientHeight !== node.clientHeight)
    )
      scrollToLatest();
    measure();
  };
  const position = useEffectEvent(() => {
    const node = container.current;
    if (!node || !positionReady) return;
    if (!positioned.current) {
      positioned.current = true;
      const divider = node.querySelector<HTMLElement>("[data-unread-divider]");
      node.scrollTop = divider
        ? node.scrollTop + divider.getBoundingClientRect().top - node.getBoundingClientRect().top
        : node.scrollHeight;
    } else if (follow.current) node.scrollTop = node.scrollHeight;
    // Moving to or from an older page changes the newest message too, but nothing new arrived.
    else if (!olderPage && !showedOlderPage.current) setUnseen(true);
    // Setting the same scroll position fires no scroll event, so measure here too.
    measure();
  });
  // Position again only when the newest message changes or the first position becomes known.
  // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Position only when the newest message changes or the first position becomes known.
  useLayoutEffect(() => position(), [lastId, positionReady]);
  // Runs after the effect above, so it still sees the page the previous render showed.
  useLayoutEffect(() => {
    showedOlderPage.current = olderPage;
  });
  const followLatest = useEffectEvent(() => {
    scrollToLatest();
    // Measure now so following, and the cleared notice, do not wait for the scroll event.
    measure();
  });
  // Sending a message goes to the newest messages and follows them, as in other chat apps.
  // Move only when a send starts.
  useLayoutEffect(() => {
    if (sending) followLatest();
  }, [sending]);
  const resize = useEffectEvent(() => {
    if (!positioned.current) return;
    // Keep the pre-resize follow state: measuring the larger content first can lose the bottom.
    if (follow.current) scrollToLatest();
    measure();
  });
  useLayoutEffect(() => {
    const node = container.current;
    const body = content.current;
    if (!node || !body) return;
    const observer = new ResizeObserver(() => resize());
    // The scroll viewport stays the same size when a reaction row or other message content grows.
    observer.observe(body);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const showLatest = away && !olderPage;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        role="log"
        aria-label="Messages"
        className="isolate min-h-0 flex-1 overflow-y-auto pt-4 pb-3"
        onScroll={onScroll}
      >
        <div ref={content}>
          {header}
          {children}
        </div>
      </div>
      {(footer || (showLatest && unseen)) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          {footer}
          {showLatest && unseen && (
            <span className="pointer-events-auto rounded-md shadow-floating">
              <Button type="button" variant="outline" size="sm" onClick={scrollToLatest}>
                <ArrowDown aria-hidden="true" /> New messages
              </Button>
            </span>
          )}
        </div>
      )}
      {showLatest && !unseen && (
        <span className="absolute right-4 bottom-3 rounded-md shadow-floating">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Scroll to latest"
                onClick={scrollToLatest}
              >
                <ArrowDown />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scroll to latest</TooltipContent>
          </Tooltip>
        </span>
      )}
    </div>
  );
}
