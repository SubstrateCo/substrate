import type { ReactNode } from "react";

import { EmojiPicker } from "@/components/messaging/composer/emoji-picker";
import type { Message } from "@/components/messaging/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageSquare } from "lucide-react";

/**
 * Floats over the message's top-right corner on hover or focus, so it reserves no space in the
 * timeline. On devices without hover it stays visible.
 */
export function MessageToolbar({
  message,
  onReact,
  pending,
  onThread,
  actions,
}: {
  message: Message;
  onReact: (emoji: string) => void;
  pending: boolean;
  onThread?: (id: string) => void;
  actions?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label="Message actions"
      className="absolute top-1 right-4 z-10 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 text-popover-foreground shadow-raised transition-opacity duration-100 group-hover/message:opacity-100 group-has-focus-visible/message:opacity-100 has-data-[state=open]:opacity-100 motion-reduce:transition-none [@media(hover:hover)]:opacity-0"
    >
      {!message.deletedAt && (
        <EmojiPicker
          label="React to message"
          size="icon-sm"
          onSelect={onReact}
          disabled={pending}
        />
      )}
      {onThread && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Reply in thread"
              onClick={() => onThread(message.id)}
            >
              <MessageSquare aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reply in thread</TooltipContent>
        </Tooltip>
      )}
      {actions}
    </div>
  );
}

/** Reactions and the reply count. Renders nothing when there are neither. */
export function MessageReactions({
  message,
  onReact,
  pending,
  onThread,
  renderReaction,
}: {
  message: Message;
  onReact: (emoji: string) => void;
  pending: boolean;
  onThread?: (id: string) => void;
  renderReaction?: (reaction: Message["reactions"][number]) => ReactNode;
}) {
  const replies = onThread ? message.replyCount : 0;
  if (!message.reactions.length && !replies) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {message.reactions.map((reaction) => {
        const { emoji, count, reacted } = reaction;
        return renderReaction ? (
          <span key={emoji}>{renderReaction(reaction)}</span>
        ) : (
          <Button
            key={emoji}
            size="xs"
            variant="reaction"
            aria-label={`${emoji}, ${count} ${count === 1 ? "reaction" : "reactions"}`}
            aria-pressed={reacted}
            disabled={pending}
            onClick={() => onReact(emoji)}
          >
            {emoji} {count}
          </Button>
        );
      })}
      {!!replies && (
        <Button type="button" size="xs" variant="link" onClick={() => onThread?.(message.id)}>
          <MessageSquare aria-hidden="true" />
          {`${replies} ${replies === 1 ? "reply" : "replies"}`}
        </Button>
      )}
    </div>
  );
}
