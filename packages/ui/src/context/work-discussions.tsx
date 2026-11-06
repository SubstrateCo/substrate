import type { ReactNode } from "react";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import { DiscussionItem, type Discussion } from "./discussion-item";

export function WorkDiscussions({
  items,
  loading,
  error,
  onRetry,
  label = "Related context",
  children,
}: {
  items: Discussion[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  label?: string;
  children?: ReactNode;
}) {
  const rows = isAccessFailure(error) ? [] : items;
  return (
    <section aria-label={label} className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">{label}</h3>
      {children}
      {loading && !rows.length && (
        <LoadingState label="Loading related context" variant="compact" />
      )}
      {error && <ErrorState compact title="Couldn't load related context" onRetry={onRetry} />}
      {!loading && !error && !rows.length && (
        <p className="text-sm text-muted-foreground">No accessible discussions linked yet.</p>
      )}
      {rows.map((item) => (
        <DiscussionItem key={`${item.messageId}:${item.purpose}`} item={item} />
      ))}
    </section>
  );
}
