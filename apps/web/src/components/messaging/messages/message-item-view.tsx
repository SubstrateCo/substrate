import type { ReactNode } from "react";

import { MessageMarkdown } from "../markdown/message-markdown";
import type { Message } from "../types";
import { MessageInteractions } from "@/components/messaging/messages/message-item/message-interactions";

export function MessageItem({
  message,
  onReact,
  pending = false,
  error,
  onThread,
  body,
  actions,
  children,
}: {
  message: Message;
  onReact: (emoji: string) => void;
  pending?: boolean;
  error?: Error | null;
  onThread?: (id: string) => void;
  body?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="group flex gap-2.5 px-4 py-2 hover:bg-muted/40">
      <div
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/10 bg-accent text-sm font-semibold text-accent-foreground shadow-surface"
      >
        {(message.authorName || "?").slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold">{message.authorName || "Unknown member"}</span>
          <time
            dateTime={new Date(message.createdAt).toISOString()}
            title={new Date(message.createdAt).toLocaleString()}
            className="text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </div>
        {body ?? <MessageMarkdown body={message.body} />}
        <MessageInteractions
          message={message}
          onReact={onReact}
          pending={pending}
          error={error}
          onThread={onThread}
          actions={actions}
        />
        {children}
      </div>
    </article>
  );
}
