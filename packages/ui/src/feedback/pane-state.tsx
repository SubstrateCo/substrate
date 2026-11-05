import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";
import { isAccessFailure } from "./request-failure";

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
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-sm">
          <ErrorState
            title={label}
            description={
              description ??
              (isAccessFailure(error)
                ? "Check that you’re signed in to the right workspace and still have access, then try again."
                : undefined)
            }
            onRetry={onRetry}
          />
        </div>
      </div>
    );
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-5">
      <LoadingState label={label} variant="messages" rows={4} />
    </div>
  );
}
