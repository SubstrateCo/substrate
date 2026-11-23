import { Timestamp } from "@/components/time/timestamp";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
    <Alert role="status" presentation="inline">
      <Archive aria-hidden="true" className="text-muted-foreground" />
      <AlertDescription>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-56 text-foreground">
            Archived {archivedBy ? `by ${archivedBy} ` : ""}on{" "}
            <Timestamp value={archivedAt} format="date" />. This project and its tasks are
            read-only.
          </p>
          {onRestore && (
            <Button variant="outline" size="sm" disabled={restorePending} onClick={onRestore}>
              <RotateCcw aria-hidden="true" />
              Restore project
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
