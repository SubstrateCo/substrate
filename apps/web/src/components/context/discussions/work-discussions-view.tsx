import type { ReactNode } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../ui/empty";
import { DiscussionItem, type Discussion } from "./discussion-item";
import { MessagesSquare } from "lucide-react";

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
    <section aria-label={label} className="space-y-3">
      <h3 className="text-sm font-semibold">{label}</h3>
      {children}
      {loading && !rows.length && (
        <LoadingState label="Loading related context" variant="messages" rows={2} />
      )}
      {error && <ErrorState compact title="Couldn't load related context" onRetry={onRetry} />}
      {!loading && !error && !rows.length && (
        <div className="rounded-xl border border-dashed">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessagesSquare aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No discussions yet</EmptyTitle>
              <EmptyDescription>
                Messages that link or reference this work will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
      {!!uniqueRows.length && (
        <ul className="space-y-2">
          {uniqueRows.map((item) => (
            <DiscussionItem key={`${item.messageId}:${item.purpose}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
