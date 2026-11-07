import type { ReactNode } from "react";

import { MessageMarkdown } from "../markdown/message-markdown";
import type { Message } from "../types";
import { MessageInteractions } from "@/components/messaging/messages/message-item/message-interactions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function MessageItem({
  message,
  onReact,
  pending = false,
  onThread,
  body,
  actions,
  children,
}: {
  message: Message;
  onReact: (emoji: string) => void;
  pending?: boolean;
  onThread?: (id: string) => void;
  body?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="group flex gap-2.5 px-4 py-2 hover:bg-muted/40">
      <Avatar aria-hidden="true" variant="message" className="size-9">
        <AvatarFallback>{(message.authorName || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
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
          onThread={onThread}
          actions={actions}
        />
        {children}
      </div>
    </article>
  );
}
