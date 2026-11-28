import { InlineNotice } from "@/components/feedback/inline-notice";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Archive, RotateCcw } from "lucide-react";

export function ProjectArchivedNotice({
  archivedAt,
  archivedBy,
  restorePending = false,
  onRestore,
}: {
  archivedAt: string;
  archivedBy?: string;
  restorePending?: boolean;
  onRestore?: () => void;
}) {
  return (
    <InlineNotice
      icon={Archive}
      action={
        onRestore && (
          <Button variant="outline" size="sm" disabled={restorePending} onClick={onRestore}>
            <RotateCcw aria-hidden="true" />
            Restore project
          </Button>
        )
      }
    >
      Archived {archivedBy ? `by ${archivedBy} ` : ""}on{" "}
      <Timestamp value={archivedAt} format="date" />. This project and its tasks are read-only.
    </InlineNotice>
  );
}
