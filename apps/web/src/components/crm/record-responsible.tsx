import { useRecordPeople } from "./record-people";

export function RecordResponsible({
  organizationId,
  actorEntityId,
}: {
  organizationId: string;
  actorEntityId: string;
}) {
  const directory = useRecordPeople(organizationId);
  if (directory.error) return <>Unavailable</>;
  if (directory.pending) return <>Loading…</>;
  return (
    <>{directory.people.find((person) => person.id === actorEntityId)?.name ?? "Former member"}</>
  );
}
