import { CircleAlert } from "lucide-react";
import { Button } from "../primitives/button";

export function PaneState({
  label,
  error,
  onRetry,
}: {
  label: string;
  error?: Error | null;
  onRetry?: () => void;
}) {
  if (error)
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-raised">
          <CircleAlert aria-hidden="true" className="mx-auto mb-4 size-7 text-destructive" />
          <h2 className="mb-2 font-semibold">{label}</h2>
          <p role="alert" className="break-words text-sm leading-relaxed text-muted-foreground">
            {error.message}
          </p>
          {onRetry && (
            <Button className="mt-5" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  return (
    <div role="status" aria-label={label} className="min-h-0 flex-1 overflow-hidden p-5">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-7 motion-safe:animate-pulse">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="flex gap-3">
            <div className="size-9 shrink-0 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded-full bg-muted" />
              <div className="h-3 w-4/5 rounded-full bg-muted" />
              <div className="h-3 w-1/2 rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
