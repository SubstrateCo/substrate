import { ErrorState } from "../feedback/error-state";

export function MessageUnavailable({ onRetry }: { onRetry: () => void }) {
  return <ErrorState compact title="Message unavailable" onRetry={onRetry} />;
}
