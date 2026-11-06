import type { ReactNode } from "react";

import { FormMessage } from "../auth/form-message";
import { Button } from "../primitives/button";
import { EmojiPicker } from "./emoji-picker";
import { MessageMarkdown } from "./message-markdown";
import type { Message } from "./types";
import { MessageSquare } from "lucide-react";

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
  const threadAction = onThread && (
    <Button
      size={message.replyCount ? "xs" : "icon-xs"}
      variant="ghost"
      aria-label={message.replyCount ? undefined : "Reply in thread"}
      title="Reply in thread"
      onClick={() => onThread(message.id)}
    >
      <MessageSquare className="size-3" aria-hidden="true" />
      {message.replyCount
        ? `${message.replyCount} ${message.replyCount === 1 ? "reply" : "replies"}`
        : null}
    </Button>
  );
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
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {message.reactions.map(({ emoji, count, reacted }) => (
            <Button
              key={emoji}
              size="xs"
              variant="reaction"
              aria-label={`${emoji}, ${count} reactions`}
              aria-pressed={reacted}
              disabled={pending}
              onClick={() => onReact(emoji)}
            >
              {emoji} {count}
            </Button>
          ))}
          {!!message.replyCount && threadAction}
          <div
            role="group"
            aria-label="Message actions"
            className="flex min-w-0 flex-wrap items-center gap-1 group-focus-within:opacity-100 group-hover:opacity-100 has-data-[state=open]:opacity-100 [@media(hover:hover)]:opacity-0"
          >
            <EmojiPicker label="React to message" onSelect={onReact} disabled={pending} />
            {actions}
            {!message.replyCount && threadAction}
          </div>
        </div>
        <FormMessage
          error={error}
          errorDescription="Your reaction couldn’t be saved. Try selecting it again."
        />
        {children}
      </div>
    </article>
  );
}
