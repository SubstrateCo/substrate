import type { PickerPerson } from "./people-picker";

/** Active actors from an authoritative, current-organization server response. */
type RecordActor = {
  entityId: string;
  userId: string | null;
  type: "human" | "agent";
};

export function recordPeople(actors: readonly RecordActor[], members: readonly PickerPerson[]) {
  const people = new Map(members.map((person) => [person.id, person]));
  return actors.flatMap((actor) => {
    const person = actor.type === "human" && actor.userId ? people.get(actor.userId) : undefined;
    return person ? [{ ...person, id: actor.entityId }] : [];
  });
}
