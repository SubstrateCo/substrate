import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";

export function TaskActivity({
  items,
  loading,
  error,
  onRetry,
}: {
  items: { id: string; action: string; actorName: string | null }[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
}) {
  const visible = isAccessFailure(error) ? [] : items;
  return (
    <section aria-label="Task activity" className="space-y-2 border-t pt-4">
      <h3 className="font-semibold">Activity</h3>
      {loading && !visible.length && <LoadingState label="Loading activity" variant="compact" />}
      {error && <ErrorState compact title="Couldn't load activity" onRetry={onRetry} />}
      {!loading && !error && !visible.length && (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      )}
      {visible.map((event) => (
        <p key={event.id} className="text-sm">
          {event.action} · {event.actorName}
        </p>
      ))}
    </section>
  );
}
