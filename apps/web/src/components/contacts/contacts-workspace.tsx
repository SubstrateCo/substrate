import { ContactDetail } from "./contact-detail";
import { RecordCollection } from "@/components/records/record-collection";

export function ContactsWorkspace({
  organizationId,
  recordId,
}: {
  organizationId: string;
  recordId?: string;
}) {
  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {recordId ? (
        <ContactDetail key={recordId} organizationId={organizationId} entityId={recordId} />
      ) : (
        <RecordCollection organizationId={organizationId} kind="contacts" />
      )}
    </div>
  );
}
