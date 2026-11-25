import { ErrorState } from "./error-state";
import { LoadingState } from "@/components/feedback/loading-state";

export function PaneState({
  label,
  error,
  onRetry,
  description,
}: {
  label: string;
  error?: Error | null;
  onRetry?: () => void;
  description?: string;
}) {
  if (error)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ErrorState title={label} description={description} onRetry={onRetry} />
      </div>
    );
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-6">
      <LoadingState label={label} variant="messages" rows={4} />
    </div>
  );
}
