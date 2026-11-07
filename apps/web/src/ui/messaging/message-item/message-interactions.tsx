import type { ReactNode } from "react";

import { FormMessage } from "@/ui/auth/form-message";
import { EmojiPicker } from "@/ui/messaging/emoji-picker";
import type { Message } from "@/ui/messaging/types";
import { Button } from "@/ui/primitives/button";
import { MessageSquare } from "lucide-react";

export function MessageInteractions({
  message,
  onReact,
  pending,
  error,
  onThread,
  actions,
}: {
  message: Message;
  onReact: (emoji: string) => void;
  pending: boolean;
  error?: Error | null;
  onThread?: (id: string) => void;
  actions?: ReactNode;
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
    <>
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
    </>
  );
}
