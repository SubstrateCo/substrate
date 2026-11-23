import { useInfiniteQuery } from "@tanstack/react-query";

import { useEffect } from "react";

import type { Message } from "@/api/messaging/requests";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ReactionNotice, ReactionPerson } from "@/components/messaging/messages/reaction-person";
import { Button } from "@/components/ui/button";
import { messageReactionsOptions } from "@/queries/messaging/reactions";

export function ReactionList({
  organizationId,
  message,
  emoji,
}: {
  organizationId: string;
  message: Message;
  emoji?: string;
}) {
  const people = useInfiniteQuery(
    messageReactionsOptions(organizationId, message.conversationId, message.id, emoji),
  );
  const { data, hasNextPage, isFetching, isFetchingNextPage, isFetchNextPageError, fetchNextPage } =
    people;
  const canExpandPreview = data?.pages.length === 1 && hasNextPage;
  // Expand the cached three-person preview once, not every page as it arrives.
  useEffect(() => {
    if (canExpandPreview && !isFetching && !isFetchNextPageError) void fetchNextPage();
  }, [canExpandPreview, isFetching, isFetchNextPageError, fetchNextPage]);
  if (people.isPending || (people.isError && !data))
    return <ReactionNotice error={people.isError} onRetry={() => void people.refetch()} />;
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div>
      {items.length ? (
        <ul aria-label="People who reacted">
          {items.map((person) => (
            <ReactionPerson key={person.actorId} person={person} showEmojis={!emoji} />
          ))}
        </ul>
      ) : (
        <ContentNotice variant="inline" title="No reactions yet" />
      )}
      {people.isFetchNextPageError && (
        <p role="status" className="py-2 text-sm text-muted-foreground">
          Couldn’t load more reactions. Try again.
        </p>
      )}
      {hasNextPage && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 w-full"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading reactions…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
