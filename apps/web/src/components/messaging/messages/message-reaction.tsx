import { useRef, useState } from "react";

import type { Message } from "@/api/messaging/requests";
import { ReactionPreview } from "@/components/messaging/messages/reaction-preview";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export function MessageReaction({
  organizationId,
  message,
  reaction,
  onReact,
  pending,
  onViewAll,
}: {
  organizationId: string;
  message: Message;
  reaction: Message["reactions"][number];
  onReact?: (emoji: string) => void;
  pending: boolean;
  onViewAll: (emoji: string, trigger: HTMLButtonElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { emoji, count, reacted } = reaction;
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={400} closeDelay={200}>
      <HoverCardTrigger asChild>
        <Button
          ref={trigger}
          type="button"
          size="xs"
          variant="reaction"
          aria-label={`${emoji}, ${count} ${count === 1 ? "reaction" : "reactions"}`}
          aria-pressed={onReact ? reacted : undefined}
          disabled={pending}
          onClick={() => (onReact ? onReact(emoji) : onViewAll(emoji, trigger.current))}
        >
          {emoji} {count}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" collisionPadding={12}>
        {open && (
          <ReactionPreview
            organizationId={organizationId}
            message={message}
            emoji={emoji}
            count={count}
            onViewAll={() => {
              setOpen(false);
              onViewAll(emoji, trigger.current);
            }}
          />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
