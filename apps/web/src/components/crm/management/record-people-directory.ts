import { useQuery } from "@tanstack/react-query";

import type { PickerPerson } from "@/lib/people/people-picker";
import { crmPeopleOptions } from "@/queries/crm/management";
import { workspacePeopleQueryOptions } from "@/queries/organizations/people";

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

export function useRecordPeople(organizationId: string) {
  const actors = useQuery(crmPeopleOptions(organizationId));
  const members = useQuery(workspacePeopleQueryOptions(organizationId));
  const error = actors.error ?? members.error;
  return {
    people: error ? [] : recordPeople(actors.data ?? [], members.data ?? []),
    pending: actors.isPending || members.isPending,
    error,
  };
}
