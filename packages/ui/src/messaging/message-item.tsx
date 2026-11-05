import { MessageSquare } from "lucide-react";
import type { Message } from "./types";
import { Button } from "../primitives/button";
import { FormMessage } from "../auth/form-message";
import { EmojiPicker } from "./emoji-picker";
import { MessageMarkdown } from "./message-markdown";

export function MessageItem({
  message,
  onReact,
  pending = false,
  error,
  onThread,
}: {
  message: Message;
  onReact: (emoji: string) => void;
  pending?: boolean;
  error?: Error | null;
  onThread?: (id: string) => void;
}) {
  return (
    <article className="group flex gap-3 px-5 py-3 hover:bg-muted/40">
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
        <MessageMarkdown body={message.body} />
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
          <div
            role="group"
            aria-label="Message actions"
            className="flex items-center gap-1 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 has-data-[state=open]:opacity-100"
          >
            <EmojiPicker label="React to message" onSelect={onReact} disabled={pending} />
            {onThread && (
              <Button size="xs" variant="ghost" onClick={() => onThread(message.id)}>
                <MessageSquare className="size-3" />
                {message.replyCount
                  ? `${message.replyCount} ${message.replyCount === 1 ? "reply" : "replies"}`
                  : "Reply in thread"}
              </Button>
            )}
          </div>
        </div>
        <FormMessage error={error} floating />
      </div>
    </article>
  );
}
