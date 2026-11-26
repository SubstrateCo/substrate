import type { RecordActor } from "@substrate/contracts/crm/people";
import type { PickerPerson } from "@substrate/contracts/people/picker";

export function recordPeople(actors: readonly RecordActor[], members: readonly PickerPerson[]) {
  const people = new Map(members.map((person) => [person.id, person]));
  return actors.flatMap((actor) => {
    const person = actor.type === "human" && actor.userId ? people.get(actor.userId) : undefined;
    return person ? [{ ...person, id: actor.entityId }] : [];
  });
}
