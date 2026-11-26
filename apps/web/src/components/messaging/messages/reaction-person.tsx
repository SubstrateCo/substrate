import type { Reactor } from "@/api/messaging/requests";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import { PersonCardTarget } from "@/components/messaging/people/person-card-slot";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";

export function ReactionPerson({
  person,
  showEmojis = false,
}: {
  person: Reactor;
  showEmojis?: boolean;
}) {
  return (
    <Item asChild size="xs">
      <li>
        <ItemMedia>
          <PersonAvatar name={person.name} image={person.image} agent={person.type === "agent"} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <PersonCardTarget actorId={person.actorId} name={person.name}>
            <span className="block truncate rounded-sm text-sm underline-offset-2 hover:underline">
              {person.self ? "You" : person.name}
            </span>
          </PersonCardTarget>
        </ItemContent>
        <ItemActions className="max-w-1/2">
          {person.type === "agent" && <Tag>Agent</Tag>}
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

export function ReactionNotice({ error, onRetry }: { error: boolean; onRetry: () => void }) {
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
