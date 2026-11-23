import { useNavigate } from "@tanstack/react-router";

import { ContactDetail } from "./contact-detail";
import { PageSheet } from "@/components/layout/page-sheet";
import { RecordCollection } from "@/components/records/record-collection";
import { contactLink } from "@/lib/navigation/record-links";

export function ContactsWorkspace({
  organizationId,
  recordId,
}: {
  organizationId: string;
  recordId?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="@container relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <RecordCollection organizationId={organizationId} kind="contacts" />
      <PageSheet
        open={!!recordId}
        label="Contact"
        onOpenChange={(open) => {
          if (!open) void navigate(contactLink(organizationId));
        }}
      >
        {recordId && (
          <ContactDetail key={recordId} organizationId={organizationId} entityId={recordId} />
        )}
      </PageSheet>
    </div>
  );
}
