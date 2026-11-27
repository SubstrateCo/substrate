import { AccountDetail } from "./account-detail";
import { DealDetail } from "./deals/deal-detail";
import { PageSheet } from "@/components/layout/page-sheet";

export type CrmSheetRecord = { kind: "deal" | "account"; entityId: string };

const labels = { deal: "Deal", account: "Account" } as const;

/** A deal or account in a sheet over the page. Keep it mounted so exit motion can finish. */
export function CrmRecordSheet({
  record,
  onClose,
}: {
  record: CrmSheetRecord | null;
  onClose: () => void;
}) {
  return (
    <PageSheet
      open={!!record}
      label={labels[record?.kind ?? "deal"]}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {record?.kind === "deal" && <DealDetail key={record.entityId} entityId={record.entityId} />}
      {record?.kind === "account" && (
        <AccountDetail key={record.entityId} entityId={record.entityId} />
      )}
    </PageSheet>
  );
}
