import { useRecordPeople } from "./record-people-directory";
import { SkeletonText } from "@/components/feedback/skeleton-text";

export function RecordResponsible({
  organizationId,
  actorEntityId,
}: {
  organizationId: string;
  actorEntityId: string;
}) {
  const directory = useRecordPeople(organizationId);
  if (directory.error) return "Unavailable";
  if (directory.pending)
    return (
      <span role="status" aria-label="Loading">
        <SkeletonText width="6rem" />
      </span>
    );
  return directory.people.find((person) => person.id === actorEntityId)?.name ?? "Former member";
}
