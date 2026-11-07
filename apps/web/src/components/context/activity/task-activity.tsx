import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Empty, EmptyDescription } from "../../ui/empty";
import { Item, ItemContent } from "../../ui/item";

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
      <h3 className="text-sm font-semibold">Activity</h3>
      {loading && !visible.length && <LoadingState label="Loading activity" variant="compact" />}
      {error && <ErrorState compact title="Couldn't load activity" onRetry={onRetry} />}
      {!loading && !error && !visible.length && (
        <Empty>
          <EmptyDescription>No activity yet.</EmptyDescription>
        </Empty>
      )}
      {visible.map((event) => (
        <Item key={event.id} size="xs">
          <ItemContent className="min-w-0 wrap-anywhere">
            {event.action} · {event.actorName}
          </ItemContent>
        </Item>
      ))}
    </section>
  );
}
