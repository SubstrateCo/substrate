import type { AgentAvatarCode } from "@substrate/contracts/agents";

export type ActorIdentity =
  | { kind: "person"; name: string; image: string | null }
  | { kind: "agent"; name: string; avatar: AgentAvatarCode | null };

export type TypedActor = {
  type?: "human" | "agent";
  name: string;
  image?: string | null;
  avatar?: AgentAvatarCode | null;
};

export function actorIdentity({ type, name, image, avatar }: TypedActor): ActorIdentity {
  if (type === "agent") return { kind: "agent", name, avatar: avatar ?? null };
  return { kind: "person", name, image: image ?? null };
}

export function actorKindLabel(actor: ActorIdentity) {
  return actor.kind === "agent" ? "Agent" : "Person";
}

export function actorLabel(actor: ActorIdentity | null | undefined, name = actor?.name ?? "") {
  return actor?.kind === "agent" ? `${name}, Agent` : name;
}
