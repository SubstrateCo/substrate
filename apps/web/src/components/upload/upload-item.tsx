import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

export interface UploadItemProps {
  name: string;
  status: "uploading" | "complete" | "error" | "cancelled";
  progress?: number;
  onCancel?: () => void;
  onRetry?: () => void;
  disabled?: boolean;
}

export function UploadItem({
  name,
  status,
  progress,
  onCancel,
  onRetry,
  disabled,
}: UploadItemProps) {
  const statusLabels = {
    complete: "Upload complete.",
    cancelled: "Upload cancelled.",
    error: "Upload failed. Please try again.",
  };
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {status === "uploading" && <Spinner aria-hidden="true" role="presentation" />}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {status === "uploading" && onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={onCancel}
            aria-label={`Cancel upload of ${name}`}
          >
            Cancel
          </Button>
        )}
        {(status === "error" || status === "cancelled") && onRetry && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={onRetry}
            aria-label={`Retry upload of ${name}`}
          >
            Retry
          </Button>
        )}
      </div>
      {status === "uploading" ? (
        <progress
          className="h-2 w-full accent-primary"
          aria-label={`Uploading ${name}`}
          max={100}
          value={progress === undefined ? undefined : Math.min(100, Math.max(0, progress))}
        />
      ) : (
        <p
          role={status === "error" ? "alert" : "status"}
          className={status === "error" ? "text-destructive" : "text-muted-foreground"}
        >
          {statusLabels[status]}
        </p>
      )}
    </div>
  );
}
