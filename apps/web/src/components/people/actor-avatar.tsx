import type { Mood } from "@substrate/agent-avatars/config";

import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { Tag } from "@/components/feedback/tag";
import { PersonAvatar, type PersonAvatarSize } from "@/components/people/person-avatar";
import type { ActorIdentity } from "@/lib/actors/identity";

/**
 * A person or an agent: an agent draws its stored look, a person shows initials or a picture.
 * No actor, such as an unassigned task, shows the empty dashed circle.
 */
export function ActorAvatar({
  actor,
  size = "sm",
  mood,
  className,
}: {
  actor: ActorIdentity | null | undefined;
  size?: PersonAvatarSize;
  /** What an agent is doing, such as `working` during a live turn. People ignore it. */
  mood?: Mood;
  className?: string;
}) {
  if (actor?.kind === "agent")
    return <AgentAvatarView avatar={actor.avatar} size={size} mood={mood} className={className} />;
  return <PersonAvatar name={actor?.name} image={actor?.image} size={size} className={className} />;
}

/** The "Agent" tag beside an agent's name. A person gets none. */
export function ActorKindTag({
  actor,
  size,
  className,
}: {
  actor: ActorIdentity | null | undefined;
  size?: "default" | "sm";
  className?: string;
}) {
  if (actor?.kind !== "agent") return null;
  return (
    <Tag size={size} className={className}>
      Agent
    </Tag>
  );
}

/** ", Agent" for screen readers after an agent's visible name, where no tag shows it. */
export function ActorKindSuffix({ actor }: { actor: ActorIdentity | null | undefined }) {
  if (actor?.kind !== "agent") return null;
  return <span className="sr-only">, Agent</span>;
}
