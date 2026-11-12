import { useQuery } from "@tanstack/react-query";

import { FormMessage } from "@/components/feedback/form-message";
import { PeoplePicker } from "@/components/people/people-picker";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import type { PickedRecipient, PickerPerson } from "@/lib/people/people-picker";
import { crmPeopleOptions } from "@/queries/crm/management";
import { workspacePeopleQueryOptions } from "@/queries/organizations/people";

/** Active actors from an authoritative, current-organization server response. */
export type RecordActor = {
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

export function RecordPersonField({
  id,
  directory,
  value,
  onValueChange,
  onPendingTextChange,
  disabled,
}: {
  id: string;
  directory: ReturnType<typeof useRecordPeople>;
  value: PickedRecipient[];
  onValueChange: (value: PickedRecipient[]) => void;
  onPendingTextChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Person</FieldLabel>
      <PeoplePicker
        id={id}
        people={directory.people}
        value={value}
        onValueChange={onValueChange}
        onPendingTextChange={onPendingTextChange}
        allowEmail={false}
        max={1}
        disabled={disabled || directory.pending || !!directory.error}
        placeholder="Search workspace people…"
      />
      {directory.pending && <FieldDescription>Loading workspace people…</FieldDescription>}
      {!directory.pending && !directory.error && directory.people.length === 0 && (
        <FieldDescription>No eligible workspace people are available.</FieldDescription>
      )}
      <FormMessage
        error={directory.error}
        errorDescription="Couldn’t load workspace people. Close this dialog and try again."
      />
    </Field>
  );
}
