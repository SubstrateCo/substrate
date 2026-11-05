import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import type { Message } from "@/lib/messaging";
import { queryKeys } from "@/queries/keys";
import { toggleReaction } from "@/server/messaging";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-message";
import { EmojiPicker } from "./emoji-picker";
import { MessageMarkdown } from "./message-markdown";

export function MessageItem({
  message,
  organizationId,
  onThread,
}: {
  message: Message;
  organizationId: string;
  onThread?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const reaction = useMutation({
    mutationFn: async (emoji: string) => {
      return toggleReaction({ data: { organizationId, messageId: message.id, emoji } });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
  });
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
              disabled={reaction.isPending}
              onClick={() => reaction.mutate(emoji)}
            >
              {emoji} {count}
            </Button>
          ))}
          <EmojiPicker
            label="React to message"
            onSelect={(emoji) => reaction.mutate(emoji)}
            disabled={reaction.isPending}
          />
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
        <FormMessage error={reaction.error} />
      </div>
    </article>
  );
}
