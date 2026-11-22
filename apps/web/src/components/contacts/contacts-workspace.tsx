import { ContactDetail } from "./contact-detail";

export function ContactsWorkspace({
  organizationId,
  recordId,
}: {
  organizationId: string;
  recordId: string;
}) {
  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <ContactDetail key={recordId} organizationId={organizationId} entityId={recordId} />
    </div>
  );
}
