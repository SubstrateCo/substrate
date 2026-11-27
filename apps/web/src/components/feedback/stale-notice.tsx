import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * A failed refresh over data that is still shown: one muted line above the data, with "Try again"
 * when the load can be retried. A failed load with nothing to show is an `ErrorState` instead.
 */
export function StaleNotice({
  title,
  description,
  onRetry,
  className,
}: {
  title: string;
  /** A second sentence, on its own line, such as what to do when there is no retry. */
  description?: string;
  onRetry?: () => void;
  /** Placement only, such as the padding of a pane edge. */
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn("flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground", className)}
    >
      <span>{title}</span>
      {onRetry && (
        // The margin cancels the padding, so the link lines up with the text when it wraps.
        <Button type="button" variant="link" size="xs" className="-mx-2" onClick={onRetry}>
          Try again
        </Button>
      )}
      {description && <span className="basis-full">{description}</span>}
    </div>
  );
}
