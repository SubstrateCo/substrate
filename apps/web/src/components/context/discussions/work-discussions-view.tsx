import type { ReactNode } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Empty, EmptyDescription } from "../../ui/empty";
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
  const seen = new Set<string>();
  const uniqueRows = rows.filter((item) => {
    const key = `${item.messageId}:${item.purpose}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <section aria-label={label} className="space-y-4">
      <h3 className="text-sm font-semibold">{label}</h3>
      {children}
      {loading && !rows.length && (
        <LoadingState label="Loading related context" variant="compact" />
      )}
      {error && <ErrorState compact title="Couldn't load related context" onRetry={onRetry} />}
      {!loading && !error && !rows.length && (
        <Empty>
          <EmptyDescription>No accessible discussions linked yet.</EmptyDescription>
        </Empty>
      )}
      {uniqueRows.map((item) => (
        <DiscussionItem key={`${item.messageId}:${item.purpose}`} item={item} />
      ))}
    </section>
  );
}
