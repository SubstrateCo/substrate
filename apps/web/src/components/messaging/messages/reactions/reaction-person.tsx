import type { Reactor } from "@/api/messaging/requests";
import { LoadingState } from "@/components/feedback/loading-state";
import { PersonCardTarget } from "@/components/messaging/people/person-card-slot";
import { ActorAvatar, ActorKindTag } from "@/components/people/actor-avatar";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import { actorIdentity } from "@/lib/actors/identity";

export function ReactionPerson({
  person,
  showEmojis = false,
}: {
  person: Reactor;
  showEmojis?: boolean;
}) {
  const actor = actorIdentity(person);
  return (
    <Item asChild size="xs">
      <li>
        <ItemMedia>
          <ActorAvatar actor={actor} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <PersonCardTarget actorId={person.actorId} name={person.name}>
            <span className="block truncate rounded-sm text-sm underline-offset-2 hover:underline">
              {person.self ? "You" : person.name}
            </span>
          </PersonCardTarget>
        </ItemContent>
        <ItemActions className="max-w-1/2">
          <ActorKindTag actor={actor} />
          {showEmojis && (
            <span className="text-right wrap-anywhere" aria-label="Reactions">
              {person.emojis.join(" ")}
            </span>
          )}
        </ItemActions>
      </li>
    </Item>
  );
}

export function ReactionNotice({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  if (!error) return <LoadingState label="Loading reactions" variant="compact" rows={2} />;
  return (
    <div className="py-3 text-sm text-muted-foreground" role="status">
      Couldn’t load reactions.{" "}
      <Button size="xs" variant="link" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
