import { useEffect, useRef } from "react";
import type { Message } from "@/lib/messaging";
import { MessageItem } from "./message-item";

export function MessageList({
  messages,
  organizationId,
  onThread,
}: {
  messages: Message[];
  organizationId: string;
  onThread?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const lastId = messages.at(-1)?.id;
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
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          organizationId={organizationId}
          onThread={onThread}
        />
      ))}
    </div>
  );
}
