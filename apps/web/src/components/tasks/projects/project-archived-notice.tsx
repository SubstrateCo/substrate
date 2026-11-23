import { InlineNotice } from "@/components/feedback/inline-notice";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Archive, RotateCcw } from "lucide-react";

/** Shown on an archived project: it is read-only, and owners can restore it. */
export function ProjectArchivedNotice({
  archivedAt,
  archivedBy,
  restorePending = false,
  onRestore,
}: {
  archivedAt: string;
  /** The archiving person's name, when the reader may see it. */
  archivedBy?: string;
  restorePending?: boolean;
  /** Only for owners. */
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
