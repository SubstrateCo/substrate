/** A workspace person offered by a people picker. */
export type PickerPerson = { id: string; name: string; email: string; image?: string | null };

/** An owned, enabled agent offered alongside workspace people. */
export type PickerAgent = { id: string; name: string; image?: string | null };

/** An address without a person represents someone to invite. Agents use IDs, never email. */
export type PickedRecipient =
  | { email: string; person?: PickerPerson; agent?: never }
  | { agent: PickerAgent; email?: never; person?: never };

const normalize = (value: string) => value.trim().toLowerCase();

/** People who match the query by name or email and are not chosen yet, in their given order. */
export function matchPeople(
  people: readonly PickerPerson[],
  query: string,
  chosen: readonly PickedRecipient[],
) {
  const search = normalize(query);
  const taken = new Set(chosen.map((recipient) => recipient.email));
  return people.filter(
    (person) =>
      !taken.has(normalize(person.email)) &&
      (!search ||
        person.name.toLowerCase().includes(search) ||
        person.email.toLowerCase().includes(search)),
  );
}
