import { ContactDetail } from "./contact-detail";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { PageSheet } from "@/components/layout/page-sheet";
import { usePanelReturn } from "@/components/layout/use-panel-return";
import { RecordCollection } from "@/components/records/record-collection";

export function ContactsWorkspace({ recordId }: { recordId?: string }) {
  const dismiss = usePanelReturn();
  return (
    <PageLayout id="contacts" aria-label="Contacts">
      <PageContent className="@container">
        <RecordCollection kind="contacts" />
      </PageContent>
      <PageSheet
        open={!!recordId}
        label="Contact"
        onOpenChange={(open) => {
          if (!open) dismiss({ recordId: undefined });
        }}
      >
        {recordId && <ContactDetail key={recordId} entityId={recordId} />}
      </PageSheet>
    </PageLayout>
  );
}
