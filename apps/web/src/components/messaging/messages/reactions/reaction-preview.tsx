import { useInfiniteQuery } from "@tanstack/react-query";

import type { Message } from "@/api/messaging/requests";
import {
  ReactionNotice,
  ReactionPerson,
} from "@/components/messaging/messages/reactions/reaction-person";
import { Button } from "@/components/ui/button";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { messageReactionsOptions } from "@/queries/messaging/reactions";
import { ArrowRight } from "lucide-react";

export function ReactionPreview({
  message,
  emoji,
  count,
  onViewAll,
}: {
  message: Message;
  emoji: string;
  count: number;
  onViewAll: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const people = useInfiniteQuery(
    messageReactionsOptions(organizationId, message.conversationId, message.id, emoji),
  );
  const items = people.data?.pages.flatMap((page) => page.items).slice(0, 3);
  return (
    <>
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="text-base text-foreground" aria-hidden="true">
          {emoji}
        </span>
        {count === 1 ? "1 person reacted" : `${count} people reacted`}
      </p>
      {people.isPending || people.isError ? (
        <ReactionNotice error={people.error} onRetry={() => void people.refetch()} />
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
