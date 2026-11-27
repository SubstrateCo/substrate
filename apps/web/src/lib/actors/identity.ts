import type { AgentAvatarCode } from "@substrate/contracts/agents";

/**
 * Who someone is, as the renderer shows them. A person is a name and an uploaded picture; an
 * agent is a name and its stored look, never a picture. A null look shows the Bot mark.
 */
export type ActorIdentity =
  | { kind: "person"; name: string; image: string | null }
  | { kind: "agent"; name: string; avatar: AgentAvatarCode | null };

/** The shape most server rows use for a member, reactor, assignee, or author. */
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

/** A name for an accessible label: "Scout, Agent" for an agent, the bare name for a person. */
export function actorLabel(actor: ActorIdentity | null | undefined, name = actor?.name ?? "") {
  return actor?.kind === "agent" ? `${name}, Agent` : name;
}
