import { useInfiniteQuery } from "@tanstack/react-query";

import { useEffect } from "react";

import type { Message } from "@/api/messaging/requests";
import { ContentNotice } from "@/components/feedback/content-notice";
import { PendingButton } from "@/components/feedback/pending-button";
import {
  ReactionNotice,
  ReactionPerson,
} from "@/components/messaging/messages/reactions/reaction-person";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { messageReactionsOptions } from "@/queries/messaging/reactions";

export function ReactionList({ message, emoji }: { message: Message; emoji?: string }) {
  const { organizationId } = useWorkspaceScope();
  const people = useInfiniteQuery(
    messageReactionsOptions(organizationId, message.conversationId, message.id, emoji),
  );
  const { data, hasNextPage, isFetching, isFetchingNextPage, isFetchNextPageError, fetchNextPage } =
    people;
  const canExpandPreview = data?.pages.length === 1 && hasNextPage;
  useEffect(() => {
    if (canExpandPreview && !isFetching && !isFetchNextPageError) void fetchNextPage();
  }, [canExpandPreview, isFetching, isFetchNextPageError, fetchNextPage]);
  if (people.isPending || (people.isError && !data))
    return <ReactionNotice error={people.error} onRetry={() => void people.refetch()} />;
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
        <PendingButton
          size="sm"
          variant="ghost"
          className="mt-2 w-full"
          pending={isFetchingNextPage}
          onClick={() => void fetchNextPage({ cancelRefetch: false })}
        >
          Load more
        </PendingButton>
      )}
    </div>
  );
}
