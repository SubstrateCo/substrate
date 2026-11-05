import { useEffect, useRef, type ReactNode } from "react";

export function MessageList({ lastId, children }: { lastId?: string; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (follow.current && container.current)
      container.current.scrollTop = container.current.scrollHeight;
  }, [lastId]);
  return (
    <div
      ref={container}
      role="log"
      aria-label="Messages"
      className="min-h-0 flex-1 overflow-y-auto py-3"
      onScroll={() => {
        const node = container.current;
        if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
      }}
    >
      {children}
    </div>
  );
}
