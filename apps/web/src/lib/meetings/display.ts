import type { MeetingPerson } from "@substrate/contracts/meetings";

/** Source labels describe evidence, not workspace identities. */
function personLabel(person: MeetingPerson) {
  if (person.evidence === "unresolved") return `${person.name} (unnamed)`;
  if (person.evidence === "invited") return `${person.name} (invited)`;
  return person.name;
}

/** Repeated display labels need printing only once; originals retain every provider's evidence. */
export function peopleLabels(people: MeetingPerson[]) {
  return [...new Set(people.map(personLabel))];
}
