import type { ReactNode } from "react";

import { badgeCount } from "@/components/feedback/badge-count";
import { CountBadge } from "@/components/feedback/count-badge";
import { EmojiPicker } from "@/components/messaging/composer/emoji-picker";
import { useQuickReactions } from "@/components/messaging/composer/quick-reactions";
import type { Message } from "@/components/messaging/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageSquare } from "lucide-react";

export function MessageToolbar({
  message,
  onReact,
  pending,
  onThread,
  actions,
}: {
  message: Message;
  onReact?: (emoji: string) => void;
  pending: boolean;
  onThread?: (id: string) => void;
  actions?: ReactNode;
}) {
  const quickReactions = useQuickReactions();
  const canReact = onReact && !message.deletedAt;
  return (
    <div
      role="group"
      aria-label="Message actions"
      className="absolute -top-5 right-4 z-10 flex w-fit items-center gap-0.5 rounded-lg border bg-popover p-0.5 text-popover-foreground shadow-raised transition-opacity duration-100 group-hover/message:opacity-100 group-has-focus-visible/message:opacity-100 has-data-[state=open]:opacity-100 motion-reduce:transition-none max-sm:pointer-coarse:static max-sm:pointer-coarse:mt-1 [@media(hover:hover)]:opacity-0"
    >
      {canReact &&
        quickReactions.map(({ emoji, name }) => {
          const reacted = message.reactions.some(
            (reaction) => reaction.emoji === emoji && reaction.reacted,
          );
          const label = reacted ? `Remove ${name} reaction` : `React with ${name}`;
          return (
            <Tooltip key={emoji}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={label}
                  disabled={pending}
                  onClick={() => onReact(emoji)}
                >
                  <span aria-hidden="true" className="text-lg leading-none">
                    {emoji}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          );
        })}
      {canReact && (
        <EmojiPicker label="React to message" size="icon" onSelect={onReact} disabled={pending} />
      )}
      {onThread && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
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

export function MessageReactions({
  message,
  onReact,
  pending,
  onThread,
  unreadReplies = 0,
  renderReaction,
}: {
  message: Message;
  onReact?: (emoji: string) => void;
  pending: boolean;
  onThread?: (id: string) => void;
  unreadReplies?: number;
  renderReaction?: (reaction: Message["reactions"][number]) => ReactNode;
}) {
  const replies = onThread ? message.replyCount : 0;
  const repliesLabel = `${replies} ${replies === 1 ? "reply" : "replies"}`;
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
            disabled={pending || !onReact}
            onClick={() => onReact?.(emoji)}
          >
            {emoji} {count}
          </Button>
        );
      })}
      {!!replies && (
        <Button
          type="button"
          size="xs"
          variant="link"
          aria-label={unreadReplies ? `${repliesLabel}, ${unreadReplies} new` : undefined}
          onClick={() => onThread?.(message.id)}
        >
          <MessageSquare aria-hidden="true" />
          {repliesLabel}
          {!!unreadReplies && (
            <CountBadge aria-hidden>{`${badgeCount(unreadReplies)} new`}</CountBadge>
          )}
        </Button>
      )}
    </div>
  );
}
