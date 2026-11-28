import type { Mood } from "@substrate/agent-avatars/config";

import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { Tag } from "@/components/feedback/tag";
import { PersonAvatar, type PersonAvatarSize } from "@/components/people/person-avatar";
import type { ActorIdentity } from "@/lib/actors/identity";

export function ActorAvatar({
  actor,
  size = "sm",
  mood,
  className,
}: {
  actor: ActorIdentity | null | undefined;
  size?: PersonAvatarSize;
  mood?: Mood;
  className?: string;
}) {
  if (actor?.kind === "agent")
    return <AgentAvatarView avatar={actor.avatar} size={size} mood={mood} className={className} />;
  return <PersonAvatar name={actor?.name} image={actor?.image} size={size} className={className} />;
}

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

export function ActorKindSuffix({ actor }: { actor: ActorIdentity | null | undefined }) {
  if (actor?.kind !== "agent") return null;
  return <span className="sr-only">, Agent</span>;
}
