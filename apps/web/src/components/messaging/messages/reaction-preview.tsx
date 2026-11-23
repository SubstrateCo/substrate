import { useInfiniteQuery } from "@tanstack/react-query";

import type { Message } from "@/api/messaging/requests";
import { ReactionNotice, ReactionPerson } from "@/components/messaging/messages/reaction-person";
import { Button } from "@/components/ui/button";
import { messageReactionsOptions } from "@/queries/messaging/reactions";
import { ArrowRight } from "lucide-react";

export function ReactionPreview({
  organizationId,
  message,
  emoji,
  count,
  onViewAll,
}: {
  organizationId: string;
  message: Message;
  emoji: string;
  count: number;
  onViewAll: () => void;
}) {
  const people = useInfiniteQuery(
    messageReactionsOptions(organizationId, message.conversationId, message.id, emoji),
  );
  const items = people.data?.pages.flatMap((page) => page.items).slice(0, 3);
  return (
    <>
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {/* oxlint-disable-next-line design/type-scale -- An emoji glyph, not text: it is sized to read beside the label. */}
        <span className="text-base text-foreground" aria-hidden="true">
          {emoji}
        </span>
        {count === 1 ? "1 person reacted" : `${count} people reacted`}
      </p>
      {people.isPending || people.isError ? (
        <ReactionNotice error={people.isError} onRetry={() => void people.refetch()} />
      ) : (
        <ul className="mt-1" aria-label="People who reacted">
          {items?.map((person) => (
            <ReactionPerson key={person.actorId} person={person} />
          ))}
        </ul>
      )}
      {count > 3 && (
        <div className="mt-1 border-t pt-2">
          <Button variant="ghost" size="sm" className="w-full justify-between" onClick={onViewAll}>
            <span>
              <span className="text-muted-foreground">+{count - 3} more</span>
              <span className="mx-2 text-muted-foreground">·</span>View all
            </span>
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </>
  );
}
