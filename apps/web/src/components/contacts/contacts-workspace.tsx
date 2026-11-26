import { useNavigate } from "@tanstack/react-router";

import { ContactDetail } from "./contact-detail";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { PageSheet } from "@/components/layout/page-sheet";
import { RecordCollection } from "@/components/records/record-collection";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { contactLink } from "@/lib/navigation/record-links";

export function ContactsWorkspace({ recordId }: { recordId?: string }) {
  const { organizationId } = useWorkspaceScope();
  const navigate = useNavigate();
  return (
    <PageLayout id="contacts" aria-label="Contacts">
      <PageContent className="@container">
        <RecordCollection kind="contacts" />
      </PageContent>
      <PageSheet
        open={!!recordId}
        label="Contact"
        onOpenChange={(open) => {
          if (!open) void navigate(contactLink(organizationId));
        }}
      >
        {recordId && <ContactDetail key={recordId} entityId={recordId} />}
      </PageSheet>
    </PageLayout>
  );
}
