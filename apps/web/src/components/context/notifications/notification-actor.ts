import type { AgentAvatarCode } from "@substrate/contracts/agents";

import type { ActorIdentity } from "@/lib/actors/identity";

/** Who acted. The server sets `actorAvatar` exactly when the actor is an agent. */
export function notificationActor(item: {
  actorName: string | null;
  actorImage: string | null;
  actorAvatar?: AgentAvatarCode | null;
}): ActorIdentity {
  const name = item.actorName ?? "Someone";
  if (item.actorAvatar) return { kind: "agent", name, avatar: item.actorAvatar };
  return { kind: "person", name, image: item.actorImage };
}
