import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "../primitives/button";
import { cn } from "../lib/utils";

export function ErrorState({
  title,
  description = "We couldn’t load this content. Please try again.",
  onRetry,
  compact = false,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border bg-card text-foreground",
        compact ? "p-3" : "p-6 text-center shadow-surface",
      )}
    >
      <CircleAlert
        aria-hidden="true"
        className={cn("text-destructive", compact ? "mb-2 size-5" : "mx-auto mb-3 size-7")}
      />
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 wrap-break-word text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          className="mt-4"
          onClick={onRetry}
        >
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}
