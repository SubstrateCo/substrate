import type { listReactions } from "@/api/messaging/requests";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import { PersonCardTarget } from "@/components/messaging/people/person-card-slot";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";

type Reactor = Awaited<ReturnType<typeof listReactions>>["items"][number];

export function ReactionPerson({
  person,
  showEmojis = false,
}: {
  person: Reactor;
  showEmojis?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 py-2">
      <PersonAvatar name={person.name} image={person.image} agent={person.type === "agent"} />
      <div className="min-w-0 flex-1">
        <PersonCardTarget actorId={person.actorId} name={person.name}>
          <span className="block truncate rounded-sm text-sm underline-offset-2 hover:underline">
            {person.self ? "You" : person.name}
          </span>
        </PersonCardTarget>
      </div>
      {person.type === "agent" && <Tag>Agent</Tag>}
      {showEmojis && (
        <span className="ml-auto max-w-1/2 text-right wrap-anywhere" aria-label="Reactions">
          {person.emojis.join(" ")}
        </span>
      )}
    </li>
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
