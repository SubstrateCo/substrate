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
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-semibold text-indigo-800"
      >
        {(message.authorName || "?").slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold">{message.authorName || "Unknown member"}</span>
          <time
            dateTime={new Date(message.createdAt).toISOString()}
            title={new Date(message.createdAt).toLocaleString()}
            className="text-[11px] text-muted-foreground"
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
              variant="outline"
              aria-label={`${emoji}, ${count} reactions`}
              aria-pressed={reacted}
              className={
                reacted ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "text-muted-foreground"
              }
              disabled={pending}
              onClick={() => onReact(emoji)}
            >
              {emoji} {count}
            </Button>
          ))}
          <EmojiPicker label="React to message" onSelect={onReact} disabled={pending} />
          {onThread && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onThread(message.id)}
              className="text-muted-foreground"
            >
              <MessageSquare className="size-3" />
              {message.replyCount
                ? `${message.replyCount} ${message.replyCount === 1 ? "reply" : "replies"}`
                : "Reply in thread"}
            </Button>
          )}
        </div>
        <FormMessage error={error} />
      </div>
    </article>
  );
}
